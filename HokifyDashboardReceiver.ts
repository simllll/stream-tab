import { DefaultMediaReceiver } from 'castv2-client';
import { autoPromiseTimeout } from './PromiseHelper';

export interface IPlayerStatus {
	mediaSessionId: number;
	playbackRate: number;
	playerState: 'BUFFERING' | 'PLAYING' | 'IDLE' | 'STOPPED';
	currentTime: number;
	supportedMediaCommands: number;
	volume: { level: number; muted: boolean };
	activeTrackIds: string[];
	media: {
		contentId: string;
		contentType: string;
		streamType: 'LIVE' | 'BUFFERED';
		mediaCategory: 'VIDEO';
		duration: number;
		tracks: any[];
		breakClips: any[];
		breaks: any[];
	};
	currentItemId: number;
	items: {
		itemId: number;
		media: any[];
		autoplay: boolean;
		activeTrackIds: string[];
		orderId: number;
	}[];
	repeatMode: 'REPEAT_OFF';
}

export class HokifyDashboardReceiverApp extends DefaultMediaReceiver {
	static APP_ID = '62EFD2C1';

	declare session: any;

	on(event: 'error', listener: (err: Error) => void): this;
	on(event: 'status', listener: (result: IPlayerStatus) => void): this;
	on(event: any, listener: any) {
		return super.on(event, listener);
	}

	seek(time, cb) {
		return super.seek(time, cb);
	}

	async getStatus(): Promise<IPlayerStatus> {
		return new Promise<IPlayerStatus>((resolve, reject) => {
			super.getStatus((err, result) => {
				if (err) {
					reject(err);
					return;
				}
				resolve(result);
			});
		});
	}

	async load(resource: { url: string; contentType: string }): Promise<IPlayerStatus> {
		const media = {
			contentId: resource.url,
			contentType: resource.contentType || 'video/mp4',
			streamType: 'LIVE'
		};

		return autoPromiseTimeout<IPlayerStatus>(
			new Promise((resolve, reject) => {
				super.load.call(this, media, { autoplay: true }, (err, result) => {
					if (err) {
						reject(err);
						return;
					}
					resolve(result);
				});
			}),
			60000,
			'took too long to start playing'
		);
	}
}
