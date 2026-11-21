import * as bottts from "@dicebear/bottts";
import * as croodlesNeutral from "@dicebear/croodles-neutral";
import { createAvatar } from "@dicebear/core";
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
  - team:   DiceBear `croodles-neutral` — playful glyph, distinct from people
  - org:    theme-independent dark badge, white monogram, bold inner ring

  An uploaded avatar always wins — this only renders inside AvatarFallback,
  which the Avatar primitive hides the moment an AvatarImage resolves.
*/

function agentAvatar(seed: string) {
  return createAvatar(bottts, { seed }).toDataUri();
}

function teamAvatar(seed: string) {
  return createAvatar(croodlesNeutral, { seed }).toDataUri();
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

  if (kind === "org") {
    return (
      <span className={cn("block size-full", className)}>
        <OrgBadge name={name ?? ""} />
      </span>
    );
  }

  const uri = kind === "agent" ? agentAvatar(id) : teamAvatar(id);

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

export default DefaultAvatar;
