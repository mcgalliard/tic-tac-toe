const $ = s => document.querySelector(s);
const menu = $('#menu'), game = $('#game'), notice = $('#notice'), board = $('#board');
let socket, mark, current;

async function loadStats() {
  try {
    const stats = await fetch('/stats', { cache: 'no-store' }).then(response => response.ok ? response.json() : Promise.reject());
    $('#x-wins').textContent = stats.xWins;
    $('#o-wins').textContent = stats.oWins;
    $('#ties').textContent = stats.ties;
  } catch { /* The game still works if statistics are temporarily unavailable. */ }
}
loadStats();
document.addEventListener('visibilitychange', () => { if (!document.hidden && !menu.hidden) loadStats(); });

for (let i = 0; i < 9; i++) { const b = document.createElement('button'); b.className = 'cell'; b.dataset.cell = i; b.setAttribute('aria-label', `Cell ${i + 1}`); b.onclick = () => send({ type: 'move', cell: i }); board.append(b); }
function connect() {
  if (socket?.readyState === WebSocket.OPEN) return;
  socket = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`);
  socket.onmessage = e => handle(JSON.parse(e.data));
  socket.onclose = () => { if (!menu.hidden) setNotice('Connection lost. Please try again.'); };
}
function send(message) { if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message)); else setNotice('Connecting… please try again.'); }
function setNotice(text = '') { notice.textContent = text; }
function handle(msg) {
  if (msg.type === 'error') return setNotice(msg.message);
  if (msg.type === 'notice') return setNotice(msg.message);
  if (msg.type === 'joined') { mark = msg.mark; $('#code').textContent = msg.room; $('#player-count').textContent = `Players: ${msg.players} / 2`; menu.hidden = true; game.hidden = false; setNotice(''); }
  if (msg.type === 'state') render(msg);
}
function render(state) {
  current = state;
  [...board.children].forEach((cell, i) => { cell.textContent = state.board[i] || ''; cell.disabled = !!state.board[i] || state.turn !== mark || !!state.result || state.players < 2; });
  const result = state.result;
  $('#player-count').textContent = `Players: ${state.players} / 2`;
  $('#status').textContent = state.players < 2 ? `You are ${mark}. Waiting for an opponent…` : result === 'draw' ? 'It’s a draw.' : result ? (result === mark ? 'You win!' : 'Your opponent wins.') : state.turn === mark ? 'Your turn' : 'Opponent’s turn';
  if (result) loadStats();
}
function enter(type) { connect(); const room = $('#room').value.trim().toUpperCase(); const sendWhenReady = () => send(type === 'join' ? { type, room } : { type }); if (socket.readyState === WebSocket.OPEN) sendWhenReady(); else socket.addEventListener('open', sendWhenReady, { once: true }); }
$('#create').onclick = () => enter('create');
$('#join').onclick = () => enter('join');
$('#room').onkeydown = e => { if (e.key === 'Enter') enter('join'); };
$('#restart').onclick = () => send({ type: 'restart' });
$('#leave').onclick = () => { socket?.close(); menu.hidden = false; game.hidden = true; mark = null; setNotice(''); loadStats(); };
