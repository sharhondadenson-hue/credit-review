
export interface Message {
  role: 'user' | 'agent';
  text: string;
  timestamp: Date;
}

export enum ConnectionStatus {
  IDLE = 'IDLE',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  ERROR = 'ERROR'
}
