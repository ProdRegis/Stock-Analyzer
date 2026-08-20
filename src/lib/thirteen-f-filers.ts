import type { NotableInvestor } from "./types";

/**
 * Well-known 13F filers. The person is who people search for; the CIK is the
 * legal manager that actually files. Buffett does not file as himself —
 * Berkshire Hathaway does.
 */
export const NOTABLE_INVESTORS: NotableInvestor[] = [
  {
    cik: "0001067983",
    filerName: "Berkshire Hathaway",
    person: "Warren Buffett",
    aliases: ["buffett", "berkshire", "brk", "warren"],
  },
  {
    cik: "0001336528",
    filerName: "Pershing Square Capital Management",
    person: "Bill Ackman",
    aliases: ["ackman", "pershing", "bill ackman"],
  },
  {
    cik: "0001649339",
    filerName: "Scion Asset Management",
    person: "Michael Burry",
    aliases: ["burry", "scion", "michael burry", "big short"],
  },
  {
    cik: "0001350694",
    filerName: "Bridgewater Associates",
    person: "Ray Dalio",
    aliases: ["dalio", "bridgewater", "ray dalio"],
  },
  {
    cik: "0001037389",
    filerName: "Renaissance Technologies",
    person: "Jim Simons",
    aliases: ["simons", "renaissance", "rentech", "ren tech"],
  },
  {
    cik: "0001423053",
    filerName: "Citadel Advisors",
    person: "Ken Griffin",
    aliases: ["griffin", "citadel", "ken griffin"],
  },
  {
    cik: "0001167483",
    filerName: "Tiger Global Management",
    person: "Chase Coleman",
    aliases: ["tiger global", "coleman", "tiger"],
  },
  {
    cik: "0001061768",
    filerName: "Baupost Group",
    person: "Seth Klarman",
    aliases: ["klarman", "baupost", "seth klarman"],
  },
  {
    cik: "0001079114",
    filerName: "Greenlight Capital",
    person: "David Einhorn",
    aliases: ["einhorn", "greenlight", "david einhorn"],
  },
  {
    cik: "0001040273",
    filerName: "Third Point",
    person: "Daniel Loeb",
    aliases: ["loeb", "third point", "dan loeb"],
  },
  {
    cik: "0001029160",
    filerName: "Soros Fund Management",
    person: "George Soros",
    aliases: ["soros", "george soros"],
  },
  {
    cik: "0001536411",
    filerName: "Duquesne Family Office",
    person: "Stanley Druckenmiller",
    aliases: ["druckenmiller", "duquesne", "stanley druckenmiller"],
  },
  {
    cik: "0001603466",
    filerName: "Point72 Asset Management",
    person: "Steve Cohen",
    aliases: ["cohen", "point72", "point 72", "sac"],
  },
  {
    cik: "0001009207",
    filerName: "D.E. Shaw",
    person: "David Shaw",
    aliases: ["d.e. shaw", "deshaw", "de shaw"],
  },
  {
    cik: "0000921669",
    filerName: "Icahn Capital",
    person: "Carl Icahn",
    aliases: ["icahn", "carl icahn"],
  },
  {
    cik: "0001656456",
    filerName: "Appaloosa LP",
    person: "David Tepper",
    aliases: ["tepper", "appaloosa", "david tepper"],
  },
  {
    cik: "0001535392",
    filerName: "Coatue Management",
    person: "Philippe Laffont",
    aliases: ["coatue", "laffont"],
  },
  {
    cik: "0001103804",
    filerName: "Viking Global Investors",
    person: "Andreas Halvorsen",
    aliases: ["viking", "halvorsen"],
  },
];

export function padCik(value: string): string {
  return value.replace(/\D/g, "").padStart(10, "0");
}

export function matchNotableInvestors(query: string): NotableInvestor[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];

  const cik = needle.replace(/\D/g, "");
  const digits = cik.length >= 6 ? padCik(cik) : null;

  return NOTABLE_INVESTORS.filter((investor) => {
    if (digits && investor.cik === digits) return true;
    const haystack = [
      investor.filerName,
      investor.person,
      ...investor.aliases,
    ]
      .join(" ")
      .toLowerCase();
    return (
      haystack.includes(needle) ||
      investor.aliases.some((alias) => needle.includes(alias))
    );
  });
}
