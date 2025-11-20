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
}