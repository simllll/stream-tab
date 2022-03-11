import { Client } from 'castv2-client';
import { EventEmitter } from 'events';
import { HokifyDashboardReceiverApp, IPlayerStatus } from './HokifyDashboardReceiver';
import { autoPromiseTimeout } from './PromiseHelper';

// eslint-disable-next-line @typescript-eslint/naming-convention
export declare interface ChromecastDevice {
	on(event: 'status', listener: (status?: any) => void): this;
	on(event: 'playerStatus', listener: (playerStatus?: IPlayerStatus) => void): this;
}

export class ChromecastDevice extends EventEmitter implements ChromecastDevice {
	private error?: any;

	private lastState: 'BUFFERING' | 'PLAYING' | 'IDLE' | 'STOPPED';

	private bufferingCount = 0;

	constructor(
		private media: { url: string; contentType: string },
		private host: string,
		private friendlyName: string
	) {
		super();
	}

	private async connectClient(host: string): Promise<Client> {
		const client = new Client();

		await autoPromiseTimeout(
			new Promise((resolve, reject) => {
				client.connect(host, (err, result) => {
					if (err) {
						reject(err);
						return;
					}
					resolve(result);
				});
			}),
			60000,
			'took too long to connect'
		);
		delete this.error;

		client.on('error', err => {
			console.log(`[${this.host}, ${this.friendlyName}] `, 'Error: %s', err.message);
			this.error = err;
			client.close();
		});

		return client;
	}

	private async startPlayer(client): Promise<HokifyDashboardReceiverApp> {
		const player = await autoPromiseTimeout<HokifyDashboardReceiverApp>(
			new Promise((resolve, reject) => {
				client.launch(HokifyDashboardReceiverApp, async (err, result) => {
					if (err) {
						reject(err);
						return;
					}
					resolve(result);
				});
			}),
			60000,
			'took too long to start app'
		);

		return player;
	}

	private checkStatus = async (client?: any, player?: any) => {
		let usedClient;
		let usedPlayer;
		try {
			usedClient = client || (await this.connectClient(this.host));

			console.log(`[${this.host}, ${this.friendlyName}] `, 'checking status ...');

			const status = await autoPromiseTimeout<{
				applications?: {
					appId: string;
					isIdleScreen?: boolean;
				}[];
			}>(
				new Promise((resolve, reject) => {
					usedClient.getStatus((err, result) => {
						if (err) {
							reject(err);
							return;
						}
						resolve(result);
					});
				}),
				60000,
				'took too long to check status'
			);

			this.emit('status', status);

			// console.log('status', status);
			if (
				!status.applications ||
				status.applications.length === 0 ||
				status.applications.find(app => app.appId === HokifyDashboardReceiverApp.APP_ID) ||
				status.applications.find(app => app.isIdleScreen)
			) {
				usedPlayer = player || (await this.startPlayer(usedClient));
				const playerStatus = await usedPlayer.getStatus();
				this.emit('playerStatus', playerStatus);

				if (
					// if its not playing or buffering
					(playerStatus?.playerState !== 'PLAYING' && playerStatus?.playerState !== 'BUFFERING') ||
					// if the current time is below 0 - bug in chromecast?
					(playerStatus?.playerState === 'BUFFERING' &&
						((playerStatus?.currentTime !== undefined && playerStatus.currentTime < 0) ||
							this.bufferingCount > 5))
				) {
					this.bufferingCount = 0;
					console.log(`[${this.host}, ${this.friendlyName}] `, 'resume playing');
					this.emit('status', 'resume playing...');
					// Start/resume playing :-)
					try {
						await autoPromiseTimeout(
							new Promise(resolve => {
								usedPlayer.stop(resolve);
							}),
							5000,
							'stop playing'
						);
					} catch (err) {
						console.error('stopped playing failed, ignoring...', err);
					}
					const loadResult = await usedPlayer.load(this.media);
					console.log(
						`[${this.host}, ${this.friendlyName}] `,
						'media loaded',
						loadResult.playerState
					);
					this.emit('status', 'playing resumed!');
				} else if (playerStatus?.playerState === 'BUFFERING') {
					this.bufferingCount++;
				} else if (playerStatus?.playerState === 'PLAYING') {
					this.bufferingCount = 0;
				}
			}
		} catch (err) {
			if (client) {
				console.error(
					`[${this.host}, ${this.friendlyName}] `,
					'check status failed, but retrying with new client...',
					err
				);

				// rerun without client
				try {
					client.close();
				} catch (errClose) {
					console.error(
						`[${this.host}, ${this.friendlyName}] `,
						'closing client failed, ignoring...',
						errClose
					);
				}
				this.checkStatus();
				return;
			}
			// otherwise show error
			console.error(`[${this.host}, ${this.friendlyName}] `, 'check status failed', err);
		}

		if (!this.error) {
			setTimeout(() => {
				this.checkStatus(usedClient, usedPlayer);
			}, 60 * 1000);
		} else {
			console.log(
				`[${this.host}, ${this.friendlyName}] `,
				'device not registered? stopping status checks',
				this.error
			);
		}
	};

	async start() {
		try {
			const client = await this.connectClient(this.host);
			console.log(`[${this.host}, ${this.friendlyName}] `, 'connected, launching app ...');

			const player = await this.startPlayer(client);

			player.on('status', status => {
				if (this.lastState !== status.playerState) {
					console.log(
						`[${this.host}, ${this.friendlyName}] `,
						'player status changed ',
						status.playerState
					);
					this.emit('playerStatus', status);
					this.lastState = status.playerState;
				}
			});

			console.log(
				`[${this.host}, ${this.friendlyName}] `,
				'app "%s" launched, loading media %s ...',
				player.session.displayName,
				this.media.url
			);

			const loadResult = await player.load(this.media);
			console.log(`[${this.host}, ${this.friendlyName}] `, 'media loaded', loadResult.playerState);

			this.checkStatus(client, player);

			return client;
		} catch (err) {
			console.error(`[${this.host}, ${this.friendlyName}] `, 'FATAL ERROR while connecting', err);
			throw err;
		}
	}
}
