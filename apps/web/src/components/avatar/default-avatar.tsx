import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { getInitials } from "@/lib/get-initials";

export type DefaultAvatarKind = "member" | "agent" | "team" | "org";

/*
  Deterministic default avatars: when an entity has no uploaded image, render
  a generated one — zero storage, zero network, seeded from the entity id, so
  the same entity always renders the same avatar and renames never reshuffle
  it. Each kind gets its own visual language so an agent never reads as a
  person, a team never reads as an org:

  - member: initials in the caller's tone (unchanged legacy behaviour)
  - agent:  DiceBear `bottts` — a robot reads as non-human instantly
  - team:   DiceBear `fun-emoji` — a colourful emoji face reads as a team at
            a glance, unmistakable next to robots (agents) and initials (people)
  - org:    theme-independent dark badge, white monogram, bold inner ring

  An uploaded avatar always wins — this only renders inside AvatarFallback,
  which the Avatar primitive hides the moment an AvatarImage resolves.

  The DiceBear packages load through a dynamic import: static imports pulled
  ~90 KB into the entry chunk and tripped the KFL-86 budget. While the chunk
  loads (once per session) avatars show initials, then swap to the generated
  image. Rendering stays deterministic — the seed is the id.
*/

type DicebearLib = {
  agentUri(seed: string): string;
  teamUri(seed: string): string;
};

let libPromise: Promise<DicebearLib> | null = null;

function loadDicebear(): Promise<DicebearLib> {
  libPromise ??= Promise.all([
    import("@dicebear/bottts"),
    import("@dicebear/fun-emoji"),
    import("@dicebear/core"),
  ]).then(([bottts, funEmoji, core]) => ({
    agentUri: (seed: string) => core.createAvatar(bottts, { seed }).toDataUri(),
    teamUri: (seed: string) =>
      core.createAvatar(funEmoji, { seed }).toDataUri(),
  }));
  return libPromise;
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

function GeneratedAvatar({
  id,
  kind,
  name,
  className,
}: {
  id: string;
  kind: "agent" | "team";
  name: string | null | undefined;
  className?: string;
}) {
  const [uri, setUri] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    loadDicebear().then((lib) => {
      if (!alive) {
        return;
      }
      setUri(kind === "agent" ? lib.agentUri(id) : lib.teamUri(id));
    });
    return () => {
      alive = false;
    };
  }, [id, kind]);

  if (uri === null) {
    return <span className={className}>{getInitials(name)}</span>;
  }

  return (
    <img
      alt=""
      aria-hidden="true"
      className={cn("size-full", className)}
      data-kind={kind}
      src={uri}
    />
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

  if (kind === "org") {
    return (
      <span className={cn("block size-full", className)}>
        <OrgBadge name={name ?? ""} />
      </span>
    );
  }

  return (
    <GeneratedAvatar className={className} id={id} kind={kind} name={name} />
  );
}

export default DefaultAvatar;
