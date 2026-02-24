let socket: WebSocket | null = null;

const WEBSOCKET_ROY_BUS = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/roy`;

export function getWS(): WebSocket {
  if (socket) {
    return socket;
  }

  socket = new WebSocket(WEBSOCKET_ROY_BUS);
  socket.binaryType = 'arraybuffer';

  socket.onopen = () => {
    socket?.send(JSON.stringify({ type: 'hello', specimen: 'roy' }));
  };

  // socket.onclose = () => {
  //   setTimeout(getWS, 1000)
  // };

  return socket;
}
