/**
 * Structured QA Test Logger.
 * Automatically masks sensitive credential strings in logs.
 */
export class Logger {
  private static sanitize(message: string): string {
    return message
      .replace(/([a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+)/g, '***@***.com')
      .replace(/(password["']?\s*[:=]\s*["']?)([^"'&\s]+)/gi, '$1******')
      .replace(/\b(?:\d[ -]*?){13,16}\b/g, '************4242');
  }

  public static info(tag: string, message: string): void {
    console.log(`[${tag.toUpperCase()}] ${this.sanitize(message)}`);
  }

  public static warn(tag: string, message: string): void {
    console.warn(`⚠️ [${tag.toUpperCase()}] ${this.sanitize(message)}`);
  }

  public static error(tag: string, message: string): void {
    console.error(`❌ [${tag.toUpperCase()}] ${this.sanitize(message)}`);
  }

  public static diagnosticBlock(details: {
    funnel: string;
    step: string;
    action: string;
    url: string;
    project: string;
    product: string;
    error?: string;
  }): void {
    console.error('\n' + '='.repeat(60));
    console.error('🛑 STUCK ON / AUTOMATION DIAGNOSTIC FAILURE');
    console.error('='.repeat(60));
    console.error(`Funnel:   ${details.funnel}`);
    console.error(`Step:     ${details.step}`);
    console.error(`Action:   ${details.action}`);
    console.error(`URL:      ${details.url}`);
    console.error(`Project:  ${details.project}`);
    console.error(`Product:  ${details.product}`);
    if (details.error) {
      console.error(`Error:    ${this.sanitize(details.error)}`);
    }
    console.error('='.repeat(60) + '\n');
  }
}