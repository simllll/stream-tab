import { launch, getStream } from 'puppeteer-stream';
import * as stream from 'stream';
import * as moment from 'moment';
import * as express from 'express';
import * as fs from 'fs';
import * as cors from 'cors';
import { exec } from 'child_process';

import * as config from './config.json';
import { ChromecastLookup } from './ChromecastLookup';
import { ChromecastDevice } from './ChromecastDevice';
import { IPlayerStatus } from './HokifyDashboardReceiver';
import { delay } from './PromiseHelper';

const originalLog = console.log;
// Overwriting
console.log = function (...args) {
	originalLog.apply(console.log, [`[${new Date().toISOString()}] `, ...args]);
};

const originalError = console.error;
// Overwriting
console.error = function (...args) {
	originalError.apply(console.error, [`[${new Date().toISOString()}] `, ...args]);
};

/*
process.on('uncaughtException', err => {
	console.error(err, err.stack);
	console.log('Node NOT Exiting...');
}); */

const app = express();

const PORT = 8000;

// const NETWORK_INTERFACE = '10.1.0.5';
// const FFMPEG_EXECUTABLE = 'C:\\ffmpeg\\bin\\ffmpeg';
// only works on windows and chrome
// const DIRECT_RENDER_MODE = true;

const dashboardStreams: {
	[screen: string]: {
		started?: Date;
		lastExited?: Date;
		lastError?: any;
		url?: string;
		lastPing?: Date;
		lastOutput?: string;
	};
} = {};
const chromeCastDevices: {
	[device: string]: {
		host?: string;
		friendlyName?: string;
		statusUpdated?: Date;
		deviceStatus?: any;
		playerStatus?: IPlayerStatus;
	};
} = {};

async function getDashboardStream(
	dashboardUrl: string,
	cookies?: {
		name: string;
		value: object | string;
		domain?: string;
	}[]
) {
	console.log(`launching browser for ${dashboardUrl}`);
	const browser = await launch({
		executablePath: config.browserExecutable,
		args: [
			'--headless=chrome',
			/* '--start-fullscreen', */ '--autoplay-policy=no-user-gesture-required',
			/* '--window-size=1920,1080', */ '--no-default-browser-check'
		],
		ignoreDefaultArgs: ['--mute-audio', '--enable-automation'],
		defaultViewport: {
			width: 1920,
			height: 1080
		}
	});

	const url = new URL(dashboardUrl);

	const context = browser.defaultBrowserContext();
	context.clearPermissionOverrides();
	context.overridePermissions(url.origin, ['camera', 'microphone']);

	const page = await context.newPage();
	if (cookies) {
		page.setCookie(
			...cookies.map(c => ({
				...c,
				value: typeof c.value === 'object' ? JSON.stringify(c.value) : c.value,
				domain: c.domain || url.host
			}))
		);
	}
	await page.goto(url.href);

	// mimeType: 'video/mp4; codecs="mpeg4, aac"'
	// mimeType: 'video/mp4; codecs="h264, aac"'
	// mimeType: video/webm;codecs=h264
	console.log(`browser started for ${dashboardUrl}, fetching stream...`);

	return {
		browser,
		stream: (await getStream(page, {
			// codecs=avc1.640029
			mimeType: config.directRenderMode ? ('video/webm;codecs=h264' as any) : 'video/webm',
			audio: true,
			video: true,
			frameSize: 1000,
			/* videoConstraints: {
				mandatory: {
					frameRate: {
						min: 10,
						ideal: 25,
						max: 26
					}
				}
			}, */
			videoBitsPerSecond: 2500000,
			audioBitsPerSecond: 256000
		} as any)) as unknown as stream.Readable
	};
}

function startStream(name: string, inputStream: stream.Readable) {
	console.log(`starting stream for "${name}"...`);
	const FPS = 25;
	const PRESET_P = 'veryfast';
	const V_SIZE = '1920x1080';
	const BUFSIZE = '6M';
	const MAXRATE = '8M';
	const BITRATE = '3M';

	// const V_SIZE_2=416x234
	// const V_SIZE_3=640x360
	// const V_SIZE_4=768x432
	// const V_SIZE_5=1280x720

	fs.mkdir(`media/live/${name}`, () => {});

	// https://superuser.com/questions/908280/what-is-the-correct-way-to-fix-keyframes-in-ffmpeg-for-dash
	const ffmpeg = exec(
		// -copytb 1
		`${config.ffmpegExecutable} -i -` +
			//			`    -preset ${PRESET_P} -keyint_min 2 -g 60 -sc_threshold 0` +
			// `    -fflags nobuffer -preset ${PRESET_P} -force_key_frames "expr:gte(t,n_forced*2)" -sc_threshold 0 -vvsync cfr -r ${FPS}` +
			`    -preset ${PRESET_P} -force_key_frames "expr:gte(t,50)" -x264opts rc-lookahead=50:keyint=100:min-keyint=50 -sc_threshold 0 -r ${FPS}` +
			`${
				// works only in chrome on windows
				config.directRenderMode
					? '    -c:v copy -c:a aac -b:a 128k -ac 1 -ar 44100'
					: // otherwise use convert default
					  `    -c:v libx264 -pi	x_fmt yuv420p -c:a aac -b:a 128k -ac 1 -ar 44100`
			}` +
			` -map v:0 -s ${V_SIZE} -b:v ${BITRATE} -maxrate ${MAXRATE} -bufsize ${BUFSIZE}    -map 0:a` +
			// '    -init_seg_name init\\$RepresentationID\\$.\\$ext\\$ -media_seg_name chunk\\$RepresentationID\\$-\\$Number%05d\\$.\\$ext\\$' +
			` -use_template 1 -use_timeline 1 -window_size 10 -extra_window_size 3` + // ' +
			` -remove_at_exit 1` +
			// ` -write_prft 1 -utc_timing_url https://time.akamai.com/?iso` +
			// -frag_type duration -frag_duration 1 -seg_duration 4 -adaptation_sets "id=0,streams=v id=1,streams=a"
			// `    -ldash 1 -streaming 1 -seg_duration 1 ` +
			// `    -seg_duration 1 ` +
			` -f dash dash.mpd`,
		{ cwd: `media/live/${name}` }
	);

	inputStream.pipe(ffmpeg.stdin);

	/*
		ffmpeg.stdout.on("data", (chunk) => {
		console.log(chunk.toString());
		}); */

	return {
		url: `http://${config.networkInterface}:8000/live/${name}/dash.mpd`,
		ffmpeg
	};
}

async function setupScreen(screen: {
	url: string;
	name: string;
	cookies: {
		name: string;
		value: { deviceName: string; audioOutput: { music: number; effect: number } };
		domain: string;
	}[];
}) {
	if (!dashboardStreams[screen.name]) {
		dashboardStreams[screen.name] = {};
	}
	try {
		const dashboardScreen = await getDashboardStream(screen.url, screen.cookies);

		const streamCast = await startStream(screen.name, dashboardScreen.stream);

		dashboardStreams[screen.name].started = new Date();

		streamCast.ffmpeg.stderr.on('data', chunk => {
			dashboardStreams[screen.name].lastPing = new Date();
			dashboardStreams[screen.name].lastOutput = chunk.toString();
			// console.error(chunk.toString());
		});

		const restartScreen = (appName: string, code: number) => {
			dashboardStreams[screen.name].lastExited = new Date();
			dashboardStreams[screen.name].lastError = `Exited with ${code}: ${
				dashboardStreams[screen.name].lastOutput
			}`;
			console.log(
				`${appName} for ${screen.name} exited, restarting... ${code}: ${
					dashboardStreams[screen.name].lastOutput
				}`
			);
			try {
				dashboardScreen.browser.close();
			} catch (err) {
				// closin gbrowser failed
			}
			setupScreen(screen);
		};

		streamCast.ffmpeg.on('exit', code => {
			restartScreen('ffmpeg', code);
		});

		dashboardScreen.browser.on('disconnected', () => {
			restartScreen('chrome', 0);
		});

		dashboardStreams[screen.name].url = streamCast.url;
	} catch (err) {
		console.error('setup screen failed', err);
		dashboardStreams[screen.name].lastError = err;
		setTimeout(() => setupScreen(screen), 5000);
	}
}

async function start() {
	app.use(cors());

	app.get('/', (_req, res) => {
		res.send(
			`<html>
					<head>
						<meta name="viewport" content="width=device-width, initial-scale=1">
					  <link rel="stylesheet" href="https://files.hokify.com/devops/led-boxes.css">
					</head>
					<body>
					  <h1><div class="led-green"></div> dasboard-streaming-server</h1>
					  Environment: ${process.env.NODE_ENV}<br>
					  Version: ${process.env.npm_package_version} (${process.env.RELEASE})<br>
					  <br>
					  <br>
						<hr>
					  <h2>Dashboard Streams:</h2>
					 
					  <ul>
					  ${Object.keys(dashboardStreams)
							.map(
								name => `<li><h3>${name}</h3>
								Url: <strong><a href="${dashboardStreams[name].url}">${dashboardStreams[name].url}</a></strong><br>
								Last Ping: <strong>${
									dashboardStreams[name].lastPing
										? moment(dashboardStreams[name].lastPing).fromNow()
										: '-'
								}</strong><br>
								Last Output: <strong>${dashboardStreams[name].lastOutput || '-'}</strong><br>
								Last Started: <strong>${
									dashboardStreams[name].started
										? moment(dashboardStreams[name].started).fromNow()
										: '-'
								}</strong><br>
								Last Exited: <strong>${
									dashboardStreams[name].lastExited
										? moment(dashboardStreams[name].lastExited).fromNow()
										: '-'
								}</strong><br>
								Last Error: <strong>${dashboardStreams[name].lastError || '-'}</strong><br></li>`
							)

							.join('')}
					  </ul>
					  <hr>
					  <h2>Chromecast Devices:</h2>
					   <ul> 
					  ${Object.keys(chromeCastDevices)
							.map(
								name => `<li><h3>${chromeCastDevices[name].friendlyName || name}</h3>
								Host: <strong>${chromeCastDevices[name].host}</strong><br>
								Last Status Update: <strong>${
									chromeCastDevices[name].statusUpdated
										? moment(chromeCastDevices[name].statusUpdated).fromNow()
										: '-'
								}</strong><br>
								Device Status: <strong><pre>${JSON.stringify(
									chromeCastDevices[name].deviceStatus
								)}</pre></strong><br>
								Player Status: <strong><pre>${JSON.stringify(
									chromeCastDevices[name].playerStatus
								)}</pre></strong><br>
								Player State: <strong>${chromeCastDevices[name].playerStatus?.playerState || '-'}</strong><br>
								</li>`
							)
							.join('')}</ul>
					  <hr>
					  <small>${process.env.npm_package_name} - ${new Date().toLocaleString()}</small>
					</body>
					</html>`
		);
	});

	console.log('starting up...');
	app.listen(PORT, () => {
		console.log(
			`listening on port ${PORT} Version: ${process.env.npm_package_version} (${process.env.RELEASE})`
		);
	});
	app.use(express.static('media'));

	for (const screen of config.screens) {
		await setupScreen(screen);
	}

	console.log('all streams up and running, connecting chrome cast devices...');

	// wait 4 seconds to let the last stream create some data files before starting :-)
	await delay(4000);

	// https://eyecatchup.github.io/hlscast/

	const chromecastLookup = new ChromecastLookup(config.networkInterface);

	chromecastLookup.on('newdevice', async (host, friendlyName) => {
		try {
			if (chromeCastDevices[host]) {
				// console.log('we got this already', host);
				return;
			}

			chromeCastDevices[host] = {
				friendlyName,
				host
			};

			console.log('new device', host, friendlyName);

			const mediaURL =
				dashboardStreams[config.chromecastMapping[friendlyName]]?.url ||
				dashboardStreams[config.defaultScreen]?.url ||
				dashboardStreams[0]?.url;

			const deviceInstance = new ChromecastDevice(
				{
					url: mediaURL,
					contentType: 'video/mp2t'
				},
				host,
				friendlyName
			);

			deviceInstance.on('status', status => {
				if (!status || !chromeCastDevices[host]) return;
				chromeCastDevices[host].statusUpdated = new Date();
				chromeCastDevices[host].deviceStatus = status;
			});

			deviceInstance.on('playerStatus', status => {
				if (!status || !chromeCastDevices[host]) return;
				chromeCastDevices[host].playerStatus = status;
			});
			const client = await deviceInstance.start();

			client.on('error', () => {
				delete chromeCastDevices[host];

				// start rediscovery
				chromecastLookup.startLookup();
			});
		} catch (err) {
			console.error(err);
			delete chromeCastDevices[host];

			setTimeout(() => {
				// try again after a while
				chromecastLookup.emit('newdevice', host, friendlyName);
			}, 60000);
		}
	});

	chromecastLookup.startLookup();
}

start();
