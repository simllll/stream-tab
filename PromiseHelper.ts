export interface IDeferredPromise {
	promise: Promise<any>;
	resolve: (value?: unknown) => Promise<void>;
	reject: (reason?: any) => Promise<void>;
}

export const newDeferredPromise = (): IDeferredPromise => {
	if (Promise && !('deferred' in Promise)) {
		let fResolve;
		let fReject;

		const P = new Promise((resolve, reject) => {
			fResolve = resolve;
			fReject = reject;
		});
		return {
			promise: P,
			resolve: fResolve,
			reject: fReject
		};
	}

	return (Promise as any).deferred;
};

export const delay = (timeoutMs: number) =>
	new Promise<void>(resolve => {
		setTimeout(() => resolve(), timeoutMs);
	});

export const autoPromiseTimeout = <T>(
	promise: Promise<T>,
	ms = 1000,
	name?: string
): Promise<T> => {
	const timeoutError = new Error(`Promise timed out${name ? `: ${name}` : ''} after ${ms}ms`); // collects stack trace
	// Create a promise that rejects in <ms> milliseconds
	const timeout = new Promise((_resolve, reject) => {
		setTimeout(() => {
			reject(timeoutError);
		}, ms);
	});

	// Returns a race between our timeout and the passed in promise
	return Promise.race([promise, timeout as any]);
};
