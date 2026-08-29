import { sendEmail, type EmailProviderOptions } from "./email-provider";

export type MailOptions = EmailProviderOptions;

// Re-exported for backward compatibility with all callers.
export { sendEmail };
