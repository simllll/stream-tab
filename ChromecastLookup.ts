import * as MDNS from 'multicast-dns';

import { EventEmitter } from 'events';
import * as dnsTxt from 'dns-txt';

// eslint-disable-next-line @typescript-eslint/naming-convention
export declare interface ChromecastLookup {
	on(event: 'newdevice', listener: (host: string, friendlyName: string) => void): this;
}

export class ChromecastLookup extends EventEmitter implements ChromecastLookup {
	private mdns: MDNS;

	private txt = dnsTxt();

	private decodeTxtEntry(txtEntry: any) {
		let decodedData: {
			d?: string;
			m?: string;
			e?: string;
			c?: string;
			n?: string;
			a?: string;
			t?: string;
			s?: string;
			f?: string;
			fn?: string;
			/*
            d: 'Chromecast',
            m: 'AAC08BA74C8D8E68',
            e: '05',
            c: '/setup/icon.png',
            n: 'Büro',
            a: '201221',
            t: '1',
            s: 'hokify dashboard',
            f: '1'
             */
		} = {};
		if (Array.isArray(txtEntry)) {
			txtEntry.forEach(item => {
				const decodedItem = this.txt.decode(item);
				Object.keys(decodedItem).forEach(key => {
					decodedData[key] = decodedItem[key];
				});
			});
		} else {
			decodedData = this.txt.decode(txtEntry);
		}
		return decodedData;
	}

	constructor(deviceIp?: string) {
		super();

		this.mdns = MDNS({ interface: deviceIp || '0.0.0.0' });

		this.mdns.on('response', response => {
			const chromeDevice = response.answers.find(
				service => service.type === 'PTR' && service.name === '_googlecast._tcp.local'
			);
			if (chromeDevice) {
				const srvEntry = response.additionals.find(service => service.type === 'SRV');
				const txtEntry = response.additionals.find(service => service.type === 'TXT');
				const aEntry = response.additionals.find(service => service.type === 'A');

				const decodedTxtEntr = txtEntry && this.decodeTxtEntry(txtEntry.data);
				const host = aEntry?.data || srvEntry?.data?.target;
				/* console.log(
					'CHROME DEVICE',
					host,
					/!* srvEntry, txtEntry, aEntry, *!/ {
						friendlyName: decodedTxtEntr?.fn || decodedTxtEntr?.n,
						runningApp: decodedTxtEntr?.s
					}
				); */
				// if we have a host, and ther eis no other app running (except for the hokify dashboard app anyway)
				// start the stream :-)
				if (host && decodedTxtEntr) {
					this.emit('newdevice', host, decodedTxtEntr?.fn || decodedTxtEntr?.n);
				}
			}

			// response.answers.forEach(onEachAnswer);
			// response.additionals.forEach(onEachAnswer);
		});
	}

	startLookup() {
		console.log('looking for chromecast devices...');
		this.mdns.query('_googlecast._tcp.local', 'PTR');
	}
}
