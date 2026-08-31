declare module "sns-validator" {
  export default class MessageValidator {
    validate(msg: Record<string, unknown>, cb: (err?: Error) => void): void;
  }
}
