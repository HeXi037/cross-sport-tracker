export interface SportCopy {
  matchDetailsHint?: string;
  timeHint?: string;
  playersHint?: string;
  scoringHint?: string;
  confirmationMessage?: string;
}

const padelDefaultCopy: SportCopy = {
  matchDetailsHint:
    'Note the match date, time and venue so partners can find the fixture later.',
  timeHint: 'Enter the local start time so partners can follow the fixture',
  playersHint:
    'Pick the players for sides A and B. Leave a spot blank if a walkover occurred.',
  scoringHint:
    'Use the final set tally for each team (for example 6-3, 4-6, 6-4 → enter 2 and 1).',
  confirmationMessage: 'Save this padel match result?',
};

const padelEnAuCopy: SportCopy = {
  matchDetailsHint:
    'Log the match details so clubmates back in Australia know when you played.',
  confirmationMessage: 'Lock in this padel result?',
};

const padelAmericanoDefaultCopy: SportCopy = {
  matchDetailsHint:
    'Capture the Americano rotation so everyone can follow when each tie was played.',
  timeHint:
    'Enter the start time for this tie so the Americano session timeline stays accurate',
  playersHint:
    'Padel Americanos are doubles—select the two players on each side according to your rotation sheet.',
  scoringHint:
    'Enter the total points each pair collected (for example 24-20 in a race to 32).',
  confirmationMessage: 'Save this padel Americano tie?',
};

const padelAmericanoEnAuCopy: SportCopy = {
  matchDetailsHint:
    'Log the Americano details so your Aussie crew knows when the session ran.',
  confirmationMessage: 'Lock in this padel Americano tie?',
};

const SPORT_COPY: Record<string, Record<string, SportCopy>> = {
  bowling: {
    default: {
      matchDetailsHint:
        'Record when and where the game took place so everyone can follow the series.',
      timeHint:
        'Follow the local format shown in the example so the series timeline stays accurate',
      playersHint: 'Assign each scorecard to the correct bowler before entering their frames.',
      scoringHint:
        'Enter each roll per frame. Leave roll 2 empty after a strike and only fill roll 3 in the final frame when it is earned. Running totals update as you go.',
      confirmationMessage: 'Save this bowling scorecard?',
    },
    'en-au': {
      matchDetailsHint:
        'Capture the session details so your mates can see when the round was played.',
      confirmationMessage: 'Ready to save this bowling scorecard?',
    },
  },
  padel: {
    default: padelDefaultCopy,
    'en-au': padelEnAuCopy,
  },
  padel_americano: {
    default: padelAmericanoDefaultCopy,
    'en-au': padelAmericanoEnAuCopy,
  },
  pickleball: {
    default: {
      matchDetailsHint:
        'Add the match timing and venue so partners can look back on the session.',
      timeHint: 'Record the local start time so partners know when you played',
      playersHint:
        'Choose the lineup for each side. Leave the second slot empty for singles games.',
      scoringHint:
        'Enter the winning game totals for teams A and B (best of three unless noted).',
      confirmationMessage: 'Save this pickleball match?',
    },
    'en-au': {
      matchDetailsHint:
        'Keep track of when you hit the court so Aussie teammates can follow along.',
      confirmationMessage: 'Happy to save this pickleball result?',
    },
  },
  table_tennis: {
    default: {
      matchDetailsHint:
        'Record the session details so training partners can review the fixture later.',
      timeHint: 'Enter the start time using your local format for clarity',
      playersHint:
        'Select the competitors for each side. Leave unused slots blank for forfeits.',
      scoringHint:
        'Enter the number of games won by each side (first to three in most matches).',
      confirmationMessage: 'Save this table tennis result?',
    },
    'en-au': {
      matchDetailsHint:
        'Log the hit-up details so mates back home know when you played.',
      confirmationMessage: 'Lock this table tennis result into the records?',
    },
  },
};

function getLocaleChain(locale: string): string[] {
  const lower = (locale ?? '').toLowerCase();
  const parts = lower.split('-').filter(Boolean);
  const chain = ['default'];
  if (parts[0]) {
    chain.push(parts[0]);
  }
  if (parts.length > 1) {
    chain.push(lower);
  }
  return chain;
}

export function getSportCopy(sportId: string, locale: string): SportCopy {
  const sportKey = sportId.toLowerCase();
  const buckets = SPORT_COPY[sportKey] ?? {};
  const chain = getLocaleChain(locale);
  const result: SportCopy = {};

  for (const key of chain) {
    const copy = buckets[key];
    if (copy) {
      Object.assign(result, copy);
    }
  }

  return result;
}
