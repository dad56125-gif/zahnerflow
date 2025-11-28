import { WebSocketGateway, WebSocketServer, SubscribeMessage, ConnectedSocket } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({ cors: { origin: '*', credentials: true } })
export class FurnaceGateway {
  @WebSocketServer() server: Server;

  @SubscribeMessage('subscribeToFurnace')
  handleSubscribe(@ConnectedSocket() client: Socket) {
    client.join('furnace_room');
    client.emit('subscribedToFurnace', { message: 'Subscribed' });
  }

  @SubscribeMessage('unsubscribeFromFurnace')
  handleUnsubscribe(@ConnectedSocket() client: Socket) {
    client.leave('furnace_room');
    client.emit('unsubscribedFromFurnace', { message: 'Unsubscribed' });
  }

  sendFurnaceStatusUpdate(data: any) {
    this.server.to('furnace_room').emit('furnaceStatusUpdate', data);
  }

  send_read_progress(data: { progress: number; current_segment?: number }) {
    this.server.to('furnace_room').emit('furnace:read_progress', {
      device: 'furnace',
      timestamp: new Date().toISOString(),
      type: 'read_progress',
      ...data
    });
  }

  send_write_progress(data: { progress: number; current_segment?: number }) {
    this.server.to('furnace_room').emit('furnace:write_progress', {
      device: 'furnace',
      timestamp: new Date().toISOString(),
      type: 'write_progress',
      ...data
    });
  }
}