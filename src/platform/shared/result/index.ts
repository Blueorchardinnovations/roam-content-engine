export type Success<TValue> = {
  readonly ok: true;
  readonly value: TValue;
};

export type Failure<TError> = {
  readonly ok: false;
  readonly error: TError;
};

export type Result<TValue, TError> =
  | Success<TValue>
  | Failure<TError>;

export function success<TValue>(
  value: TValue
): Success<TValue> {
  return {
    ok: true,
    value
  };
}

export function failure<TError>(
  error: TError
): Failure<TError> {
  return {
    ok: false,
    error
  };
}

export function isSuccess<TValue, TError>(
  result: Result<TValue, TError>
): result is Success<TValue> {
  return result.ok;
}

export function isFailure<TValue, TError>(
  result: Result<TValue, TError>
): result is Failure<TError> {
  return !result.ok;
}
