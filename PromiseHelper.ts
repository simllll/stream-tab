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

export const delayedReject = <T = any>(
	timeoutMs: number,
	msg = `timeout of ${timeoutMs} reached`
) =>
	new Promise((_resolve, reject) => {
		setTimeout(() => reject(msg), timeoutMs);
	}) as T extends Promise<infer U> ? Promise<U> : Promise<T>;

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

/**
 * Retries the given function until it succeeds given a number of retries and an interval between them. They are set
 * by default to retry 5 times with 1sec in between. There's also a flag to make the cooldown time exponential
 * @author Daniel Iñigo <danielinigobanos@gmail.com>
 * @param {Function} fn - Returns a promise
 * @param {Number} retriesLeft - Number of retries. If -1 will keep retrying
 * @param {Number} interval - Millis between retries. If exponential set to true will be doubled each retry
 * @param {Boolean} exponential - Flag for exponential back-off mode
 * @return {Promise<*>}
 */
export const retryPromise = async <T>(
	fn: () => Promise<T>,
	retriesLeft = 5,
	interval = 1000,
	exponential = false
) => {
	try {
		return await fn();
	} catch (error) {
		if (retriesLeft) {
			await new Promise(r => {
				setTimeout(r, interval);
			});
			return retryPromise(fn, retriesLeft - 1, exponential ? interval * 2 : interval, exponential);
		}
		throw error;
	}
};

export const setImmediatePromise = <T>(
	resolvable: () => Promise<T> = () => undefined as any
): Promise<T> =>
	new Promise(resolve => {
		setImmediate(() => resolve(resolvable()));
	});

/** calls set immediate, to check if there is aynthing on the event queue
 * use in combination with promise.all!
 *
 * @param unblockerState
 * @param iterateCnt
 */
export const unblockLoop = async (unblockerState: { start: number }, iterateCnt?: number) => {
	const now = Date.now();
	if ((iterateCnt && iterateCnt % 10 === 0) || unblockerState.start > now - 10) {
		await new Promise(resolve => {
			setImmediate(resolve);
		});
		console.info(
			'unblocking!',
			iterateCnt && iterateCnt % 10 === 0,
			unblockerState.start > now - 10
		);
		unblockerState.start = Date.now();
	} else {
		console.info('not unblocking');
	}
};

/** prefer using unblockedPromises */
export const unblockedPromiseAll = <T>(
	listOfPromises: Iterable<T | PromiseLike<T>>,
	aggressiveness = 10
): Promise<T[]> => {
	const i = 0;
	const results: (T | PromiseLike<T>)[] = [];
	for (const promise of listOfPromises) {
		results.push(
			i % aggressiveness === 0
				? new Promise(unblockedResolve => {
						setImmediate(() => unblockedResolve(promise));
				  })
				: promise
		);
	}
	return Promise.all(results);
};

export const PromiseMap = async <T, RETVAL>(
	array: T[],
	method: (T) => RETVAL
): Promise<RETVAL[]> => {
	let blockingSince = Date.now();
	const results: RETVAL[] = [];
	for (const val of array) {
		if (blockingSince + 10 > Date.now()) {
			await setImmediatePromise();
			blockingSince = Date.now();
			console.info('unblocked');
		}

		results.push(await method(val));
	}
	return results;
};
