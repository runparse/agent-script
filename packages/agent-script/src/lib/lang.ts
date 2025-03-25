export type Exclusive<T, U> = T extends U ? (U extends T ? never : T) : T;

export type Either<A, B> = Exclusive<A, B> | Exclusive<B, A>;

export type EitherOrBoth<A, B> = Either<A, B> | (A & B);

export type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export function notEmpty<TValue>(
  value: TValue | null | undefined
): value is TValue {
  return value !== null && value !== undefined;
}

export function fulfilled<TValue>(
  value: PromiseSettledResult<TValue>
): value is PromiseFulfilledResult<TValue> {
  return value.status === 'fulfilled';
}

export function rejected<TValue>(
  value: PromiseSettledResult<TValue>
): value is PromiseRejectedResult {
  return value.status === 'rejected';
}
