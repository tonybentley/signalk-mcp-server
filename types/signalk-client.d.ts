declare module '@signalk/client' {
  export class Client {
    constructor(options: any);
    on(event: string, callback: (data?: any) => void): void;
    once(event: string, callback: (data?: any) => void): void;
    connect(): void;
    disconnect(): void;
    connected: boolean;
  }
}