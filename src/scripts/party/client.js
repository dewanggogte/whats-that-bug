import PartySocket from 'partysocket';

const configuredHost = import.meta.env.PUBLIC_PARTY_HOST || '';
const devHost = import.meta.env.DEV ? '127.0.0.1:1999' : '';
const PARTY_HOST = configuredHost || devHost;

function getPartyHost() {
  if (!PARTY_HOST) throw new Error('PUBLIC_PARTY_HOST is not configured');
  return PARTY_HOST;
}

function httpProtocolFor(host) {
  if (host.startsWith('localhost') || host.startsWith('127.0.0.1')) return 'http';
  return location.protocol === 'https:' ? 'https' : 'http';
}

export async function requestCreateRoom() {
  const host = getPartyHost();
  const protocol = httpProtocolFor(host);
  const res = await fetch(`${protocol}://${host}/parties/main/__create`, { method: 'POST' });
  if (!res.ok) throw new Error(`Room creation failed (${res.status})`);
  return res.json();
}

export function createPartyClient({ roomCode, userId, displayName, createToken, rejoinToken, onMessage, onClose, onOpen }) {
  const socket = new PartySocket({
    host: getPartyHost(),
    room: roomCode,
  });

  socket.addEventListener('open', () => {
    onOpen?.();
    socket.send(JSON.stringify({
      type: 'identify',
      userId,
      displayName,
      createToken,
      rejoinToken,
    }));
  });

  socket.addEventListener('message', (event) => {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }
    onMessage(msg);
  });

  socket.addEventListener('close', () => {
    onClose?.();
  });

  return {
    send(obj) {
      socket.send(JSON.stringify(obj));
    },
    close() {
      socket.close();
    },
  };
}
