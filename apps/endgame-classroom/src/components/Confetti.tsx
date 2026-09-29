const COLORS = ["#f7c948", "#a78bfa", "#34d399", "#60a5fa", "#f472b6", "#fb923c"];

/** CSS-only confetti burst; remount (change key) to replay. */
export default function Confetti() {
  return (
    <div className="confetti" aria-hidden="true">
      {Array.from({ length: 70 }, (_, i) => {
        const left = (i * 37) % 100;
        const delay = ((i * 13) % 40) / 100;
        const duration = 1.6 + ((i * 7) % 10) / 10;
        const rotate = (i * 47) % 360;
        return (
          <span
            key={i}
            style={{
              left: `${left}%`,
              background: COLORS[i % COLORS.length],
              animationDelay: `${delay}s`,
              animationDuration: `${duration}s`,
              transform: `rotate(${rotate}deg)`,
            }}
          />
        );
      })}
    </div>
  );
}
