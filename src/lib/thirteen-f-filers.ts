import type { NotableInvestor } from "./types";

/**
 * Well-known 13F filers. The person is who people search for; the CIK is the
 * legal manager that actually files. Buffett does not file as himself —
 * Berkshire Hathaway does. Only names with a parseable 13F book belong here.
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
  {
    cik: "0001697748",
    filerName: "ARK Investment Management",
    person: "Cathie Wood",
    aliases: ["cathie", "cathy wood", "ark", "arkk", "ark invest"],
  },
];

/**
 * Giant diversified books. Skip these when answering "who else holds this" —
 * Citadel owning a name is not a copy-trade signal.
 */
export const BROAD_13F_CIKS = new Set([
  "0001423053", // Citadel
  "0001037389", // Renaissance
  "0001009207", // D.E. Shaw
  "0001603466", // Point72
  "0001350694", // Bridgewater
  "0001167483", // Tiger Global
  "0001103804", // Viking
  "0001535392", // Coatue
]);

export function concentratedNotables(): NotableInvestor[] {
  return NOTABLE_INVESTORS.filter(
    (investor) => !BROAD_13F_CIKS.has(investor.cik)
  );
}

/** Stock-pickers used for “also in this 13F” on the thesis tab. */
const HOLDER_SCREEN_CIKS = new Set([
  "0001067983", // Buffett
  "0001336528", // Ackman
  "0001649339", // Burry
  "0001536411", // Druckenmiller
  "0001656456", // Tepper
  "0001697748", // Wood
  "0001061768", // Klarman
  "0000921669", // Icahn
]);

export function holderScreenNotables(): NotableInvestor[] {
  return NOTABLE_INVESTORS.filter((investor) =>
    HOLDER_SCREEN_CIKS.has(investor.cik)
  );
}

export function padCik(value: string): string {
  return value.replace(/\D/g, "").padStart(10, "0");
}

function notableHaystack(investor: NotableInvestor): string {
  return [investor.filerName, investor.person, ...investor.aliases]
    .join(" ")
    .toLowerCase();
}

export function matchNotableInvestors(query: string): NotableInvestor[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...NOTABLE_INVESTORS];

  const digitsOnly = needle.replace(/\D/g, "");
  const digits = digitsOnly.length >= 6 ? padCik(digitsOnly) : null;

  return NOTABLE_INVESTORS.filter((investor) => {
    if (digits && padCik(investor.cik) === digits) return true;

    const haystack = notableHaystack(investor);
    if (haystack.includes(needle)) return true;

    return haystack.split(/[^a-z0-9]+/).some((word) => word.startsWith(needle));
  });
}
