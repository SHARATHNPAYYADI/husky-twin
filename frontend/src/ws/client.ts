import type { FullSnapshot, Obstacle, RobotState, RunReport, WSMessage } from "../schema/types";
import { useSimStore } from "../store/simStore";

// In dev this falls back to localhost. In production, set VITE_WS_URL in
// Vercel's dashboard to your Render backend's wss:// URL.
const WS_URL = import.meta.env.VITE_WS_URL || "ws://localhost:8000/ws";

let socket: WebSocket | null = null;

export function connect(): void {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return;
  }

  useSimStore.getState().setStatus("connecting");
  socket = new WebSocket(WS_URL);

  socket.onopen = () => useSimStore.getState().setStatus("open");
  socket.onclose = () => useSimStore.getState().setStatus("closed");

  socket.onmessage = (event) => {
    const msg = JSON.parse(event.data) as WSMessage;
    const store = useSimStore.getState();

    if (msg.type === "full") {
      store.applyFull(msg.data as FullSnapshot);
    } else if (msg.type === "patch") {
      store.applyPatch(msg.data as RobotState);
    } else if (msg.type === "report") {
      store.applyReport(msg.data as RunReport);
    }
  };
}

function send(message: WSMessage): void {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

export function startRun(target?: [number, number]): void {
  send({ type: "start_run", data: target ? { target } : {} });
}

export function sendPlaceObstacle(obstacle: Obstacle): void {
  send({ type: "place_obstacle", data: obstacle });
}

export function resetRun(): void {
  send({ type: "reset", data: {} });
}