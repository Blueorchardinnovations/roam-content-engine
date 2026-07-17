export interface Clock {
  now(): Date;
}

export class SystemClock implements Clock {
  public now(): Date {
    return new Date();
  }
}

export class FixedClock implements Clock {
  public constructor(
    private readonly fixedTime: Date
  ) {}

  public now(): Date {
    return new Date(this.fixedTime.getTime());
  }
}

export const systemClock: Clock = new SystemClock();
