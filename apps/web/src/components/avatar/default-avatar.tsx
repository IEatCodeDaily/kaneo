import { cn } from "@/lib/cn";
import { getInitials } from "@/lib/get-initials";

/*
  Deterministic default avatars: when an entity has no uploaded image, render
  a generated one — zero storage, zero network, pure SVG seeded from the id.
  The same entity always renders the same avatar (the seed is the id hash, so
  renames don't reshuffle it), and each entity kind gets its own visual
  language so an agent never reads as a person and a team never reads as an
  org:

  - member: initials in the caller's tone (unchanged legacy behaviour)
  - agent:  symmetric 5×5 identicon, no text
  - team:   abstract glyph (one large shape + a small satellite), no text
  - org:    dark badge tile, white monogram, thin ring

  agent/team shapes draw in `currentColor`, so the caller keeps ownership of
  the tone: pass the getAvatarTone() class on the wrapping Avatar/span and the
  shapes inherit its text colour (the tint logic itself is untouched).
*/

export type DefaultAvatarKind = "member" | "agent" | "team" | "org";

/** Same string hash getAvatarTone uses, widened to an unsigned 32-bit seed. */
function hashSeed(id: string) {
  const normalized = id.trim().toLowerCase();
  let hash = 0;
  for (let i = 0; i < normalized.length; i += 1) {
    hash = (hash << 5) - hash + normalized.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) >>> 0;
}

function mulberry32(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Shape = "circle" | "square" | "triangle" | "diamond";

const SHAPES: Shape[] = ["circle", "square", "triangle", "diamond"];

function mainShape(shape: Shape, rotate: number) {
  const fill = { fill: "currentColor" };
  switch (shape) {
    case "circle":
      return <circle {...fill} cx={50} cy={54} r={26} />;
    case "square":
      return <rect {...fill} height={44} rx={8} width={44} x={28} y={32} />;
    case "triangle":
      return (
        <polygon
          {...fill}
          points="50,26 78,76 22,76"
          transform={`rotate(${rotate} 50 54)`}
        />
      );
    case "diamond":
      return (
        <polygon
          {...fill}
          points="50,24 80,54 50,84 20,54"
          transform={`rotate(${rotate} 50 54)`}
        />
      );
  }
}

function AgentIdenticon({ seed }: { seed: number }) {
  const random = mulberry32(seed);
  // Left half + middle column of a 5×5 grid; the right half mirrors the left.
  // Exactly 10 of 15 cells are filled (Fisher–Yates with the seeded PRNG), so
  // the glyph stays dense and readable at 16px instead of collapsing into a
  // sparse blob.
  const positions: Array<{ x: number; y: number }> = [];
  for (let x = 0; x <= 2; x += 1) {
    for (let y = 0; y < 5; y += 1) {
      positions.push({ x, y });
    }
  }
  for (let i = positions.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [positions[i], positions[j]] = [positions[j], positions[i]];
  }
  const cells = positions.slice(0, 10);

  return (
    <svg
      aria-hidden="true"
      className="size-full"
      data-kind="agent"
      preserveAspectRatio="xMidYMid slice"
      viewBox="0 0 5 5"
      xmlns="http://www.w3.org/2000/svg"
    >
      {cells.map((cell) => (
        <rect
          fill="currentColor"
          height={1}
          key={`${cell.x}-${cell.y}`}
          rx={0.08}
          width={1}
          x={cell.x}
          y={cell.y}
        />
      ))}
      {cells.map((cell) => (
        <rect
          fill="currentColor"
          height={1}
          key={`mirror-${cell.x}-${cell.y}`}
          rx={0.08}
          width={1}
          x={4 - cell.x}
          y={cell.y}
        />
      ))}
    </svg>
  );
}

function TeamGlyph({ seed }: { seed: number }) {
  const random = mulberry32(seed);
  const main = SHAPES[Math.floor(random() * SHAPES.length)] as Shape;
  const satelliteIsRound = random() > 0.5;
  const rotate = Math.floor(random() * 4) * 45;

  return (
    <svg
      aria-hidden="true"
      className="size-full"
      data-kind="team"
      preserveAspectRatio="xMidYMid slice"
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
    >
      {mainShape(main, rotate)}
      {satelliteIsRound ? (
        <circle cx={74} cy={30} fill="currentColor" r={10} />
      ) : (
        <rect
          fill="currentColor"
          height={16}
          rx={4}
          transform={`rotate(${rotate / 2} 74 30)`}
          width={16}
          x={66}
          y={22}
        />
      )}
    </svg>
  );
}

function OrgBadge({ name }: { name: string }) {
  const monogram = getInitials(name, "W");
  const fontSize = Array.from(monogram).length > 1 ? 40 : 52;

  return (
    <svg
      aria-hidden="true"
      className="size-full"
      data-kind="org"
      preserveAspectRatio="xMidYMid slice"
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Theme-independent badge: a fixed dark tile keeps the org distinct
          from tone-tinted people/teams in both colour schemes. The bold inner
          ring survives 16px, where a decorative ring disappears. */}
      <rect fill="#18181b" height={100} rx={14} width={100} />
      <circle
        cx={50}
        cy={50}
        fill="none"
        r={43}
        stroke="#ffffff"
        strokeOpacity={0.45}
        strokeWidth={6}
      />
      <text
        dominantBaseline="central"
        fill="#ffffff"
        fontSize={fontSize}
        fontWeight={600}
        textAnchor="middle"
        x={50}
        y={53}
      >
        {monogram}
      </text>
    </svg>
  );
}

export function DefaultAvatar({
  id,
  kind,
  name,
  className,
}: {
  id: string;
  kind: DefaultAvatarKind;
  name: string | null | undefined;
  className?: string;
}) {
  if (kind === "member") {
    return <span className={className}>{getInitials(name)}</span>;
  }

  const seed = hashSeed(id);

  return (
    <span className={cn("block size-full", className)}>
      {kind === "agent" ? (
        <AgentIdenticon seed={seed} />
      ) : kind === "team" ? (
        <TeamGlyph seed={seed} />
      ) : (
        <OrgBadge name={name ?? ""} />
      )}
    </span>
  );
}

export default DefaultAvatar;
