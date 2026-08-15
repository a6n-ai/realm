// sns-validator ships no types. Minimal surface for how we use it.
declare module "sns-validator" {
  type ValidateCallback = (err: Error | null, message?: Record<string, unknown>) => void;
  export default class MessageValidator {
    constructor(hostPattern?: RegExp, encoding?: string);
    validate(message: Record<string, unknown>, cb: ValidateCallback): void;
  }
}
