import type { InboundCommandV9 } from './types.ts';

/** Frozen legal prefixes from an empty 7×7 guided run, verified against the real reducer. */
export const INBOUND_GUIDE_V9: { readonly seed: number; readonly branches: Readonly<Record<string, readonly InboundCommandV9[]>> } = {
  seed: 6,
  branches: {
  "light_orders.placements": [
    {
      "type": "place",
      "pieceId": "piece.3",
      "origin": {
        "x": 1,
        "y": 1
      }
    },
    {
      "type": "place",
      "pieceId": "piece.5",
      "origin": {
        "x": 2,
        "y": 1
      }
    },
    {
      "type": "place",
      "pieceId": "piece.6",
      "origin": {
        "x": 1,
        "y": 1
      }
    },
    {
      "type": "place",
      "pieceId": "piece.4",
      "origin": {
        "x": 2,
        "y": 1
      }
    },
    {
      "type": "place",
      "pieceId": "piece.9",
      "origin": {
        "x": 1,
        "y": 1
      }
    },
    {
      "type": "place",
      "pieceId": "piece.8",
      "origin": {
        "x": 4,
        "y": 1
      }
    },
    {
      "type": "place",
      "pieceId": "piece.13",
      "origin": {
        "x": 2,
        "y": 2
      }
    },
    {
      "type": "place",
      "pieceId": "piece.12",
      "origin": {
        "x": 1,
        "y": 1
      }
    },
    {
      "type": "place",
      "pieceId": "piece.11",
      "origin": {
        "x": 1,
        "y": 2
      }
    },
    {
      "type": "place",
      "pieceId": "piece.16",
      "origin": {
        "x": 5,
        "y": 2
      }
    },
    {
      "type": "place",
      "pieceId": "piece.18",
      "origin": {
        "x": 1,
        "y": 3
      }
    },
    {
      "type": "upgrade",
      "upgradeId": "light_orders"
    },
    {
      "type": "place",
      "pieceId": "piece.20",
      "origin": {
        "x": 1,
        "y": 1
      }
    },
    {
      "type": "chooseCleanup",
      "branch": "placements"
    },
    {
      "type": "place",
      "pieceId": "piece.24",
      "origin": {
        "x": 1,
        "y": 1
      }
    },
    {
      "type": "place",
      "pieceId": "piece.25",
      "origin": {
        "x": 3,
        "y": 1
      }
    },
    {
      "type": "place",
      "pieceId": "piece.27",
      "origin": {
        "x": 3,
        "y": 1
      }
    },
    {
      "type": "upgrade",
      "upgradeId": "small_parcels"
    },
    {
      "type": "place",
      "pieceId": "piece.29",
      "origin": {
        "x": 3,
        "y": 1
      }
    },
    {
      "type": "place",
      "pieceId": "piece.30",
      "origin": {
        "x": 0,
        "y": 0
      }
    },
    {
      "type": "place",
      "pieceId": "piece.31",
      "origin": {
        "x": 2,
        "y": 3
      }
    },
    {
      "type": "place",
      "pieceId": "piece.33",
      "origin": {
        "x": 1,
        "y": 3
      }
    },
    {
      "type": "place",
      "pieceId": "piece.35",
      "origin": {
        "x": 2,
        "y": 2
      }
    },
    {
      "type": "place",
      "pieceId": "piece.37",
      "origin": {
        "x": 1,
        "y": 1
      }
    },
    {
      "type": "upgrade",
      "upgradeId": "candidate_slots"
    },
    {
      "type": "place",
      "pieceId": "piece.39",
      "origin": {
        "x": 1,
        "y": 1
      }
    },
    {
      "type": "place",
      "pieceId": "piece.15",
      "origin": {
        "x": 1,
        "y": 1
      }
    },
    {
      "type": "place",
      "pieceId": "piece.17",
      "origin": {
        "x": 1,
        "y": 1
      }
    }
  ],
  "light_orders.orders": [
    {
      "type": "place",
      "pieceId": "piece.3",
      "origin": {
        "x": 1,
        "y": 1
      }
    },
    {
      "type": "place",
      "pieceId": "piece.5",
      "origin": {
        "x": 2,
        "y": 1
      }
    },
    {
      "type": "place",
      "pieceId": "piece.6",
      "origin": {
        "x": 1,
        "y": 1
      }
    },
    {
      "type": "place",
      "pieceId": "piece.4",
      "origin": {
        "x": 2,
        "y": 1
      }
    },
    {
      "type": "place",
      "pieceId": "piece.9",
      "origin": {
        "x": 1,
        "y": 1
      }
    },
    {
      "type": "place",
      "pieceId": "piece.8",
      "origin": {
        "x": 4,
        "y": 1
      }
    },
    {
      "type": "place",
      "pieceId": "piece.13",
      "origin": {
        "x": 2,
        "y": 2
      }
    },
    {
      "type": "place",
      "pieceId": "piece.12",
      "origin": {
        "x": 1,
        "y": 1
      }
    },
    {
      "type": "place",
      "pieceId": "piece.11",
      "origin": {
        "x": 1,
        "y": 2
      }
    },
    {
      "type": "place",
      "pieceId": "piece.16",
      "origin": {
        "x": 5,
        "y": 2
      }
    },
    {
      "type": "place",
      "pieceId": "piece.18",
      "origin": {
        "x": 1,
        "y": 3
      }
    },
    {
      "type": "upgrade",
      "upgradeId": "light_orders"
    },
    {
      "type": "place",
      "pieceId": "piece.20",
      "origin": {
        "x": 1,
        "y": 1
      }
    },
    {
      "type": "chooseCleanup",
      "branch": "orders"
    },
    {
      "type": "place",
      "pieceId": "piece.24",
      "origin": {
        "x": 1,
        "y": 1
      }
    },
    {
      "type": "place",
      "pieceId": "piece.25",
      "origin": {
        "x": 3,
        "y": 1
      }
    },
    {
      "type": "place",
      "pieceId": "piece.27",
      "origin": {
        "x": 3,
        "y": 1
      }
    },
    {
      "type": "upgrade",
      "upgradeId": "small_parcels"
    },
    {
      "type": "place",
      "pieceId": "piece.29",
      "origin": {
        "x": 3,
        "y": 1
      }
    },
    {
      "type": "place",
      "pieceId": "piece.30",
      "origin": {
        "x": 0,
        "y": 0
      }
    },
    {
      "type": "place",
      "pieceId": "piece.31",
      "origin": {
        "x": 2,
        "y": 3
      }
    },
    {
      "type": "place",
      "pieceId": "piece.33",
      "origin": {
        "x": 1,
        "y": 3
      }
    },
    {
      "type": "place",
      "pieceId": "piece.35",
      "origin": {
        "x": 2,
        "y": 2
      }
    },
    {
      "type": "place",
      "pieceId": "piece.37",
      "origin": {
        "x": 1,
        "y": 1
      }
    }
  ],
  "small_parcels.placements": [
    {
      "type": "place",
      "pieceId": "piece.3",
      "origin": {
        "x": 1,
        "y": 1
      }
    },
    {
      "type": "place",
      "pieceId": "piece.5",
      "origin": {
        "x": 2,
        "y": 1
      }
    },
    {
      "type": "place",
      "pieceId": "piece.6",
      "origin": {
        "x": 1,
        "y": 1
      }
    },
    {
      "type": "place",
      "pieceId": "piece.4",
      "origin": {
        "x": 2,
        "y": 1
      }
    },
    {
      "type": "place",
      "pieceId": "piece.9",
      "origin": {
        "x": 1,
        "y": 1
      }
    },
    {
      "type": "place",
      "pieceId": "piece.8",
      "origin": {
        "x": 4,
        "y": 1
      }
    },
    {
      "type": "place",
      "pieceId": "piece.13",
      "origin": {
        "x": 2,
        "y": 2
      }
    },
    {
      "type": "place",
      "pieceId": "piece.12",
      "origin": {
        "x": 1,
        "y": 1
      }
    },
    {
      "type": "place",
      "pieceId": "piece.11",
      "origin": {
        "x": 1,
        "y": 2
      }
    },
    {
      "type": "place",
      "pieceId": "piece.16",
      "origin": {
        "x": 5,
        "y": 2
      }
    },
    {
      "type": "place",
      "pieceId": "piece.18",
      "origin": {
        "x": 1,
        "y": 3
      }
    },
    {
      "type": "upgrade",
      "upgradeId": "small_parcels"
    },
    {
      "type": "place",
      "pieceId": "piece.15",
      "origin": {
        "x": 4,
        "y": 2
      }
    },
    {
      "type": "place",
      "pieceId": "piece.20",
      "origin": {
        "x": 1,
        "y": 1
      }
    },
    {
      "type": "chooseCleanup",
      "branch": "placements"
    },
    {
      "type": "place",
      "pieceId": "piece.25",
      "origin": {
        "x": 1,
        "y": 1
      }
    },
    {
      "type": "place",
      "pieceId": "piece.26",
      "origin": {
        "x": 0,
        "y": 0
      }
    },
    {
      "type": "place",
      "pieceId": "piece.27",
      "origin": {
        "x": 1,
        "y": 4
      }
    },
    {
      "type": "place",
      "pieceId": "piece.29",
      "origin": {
        "x": 1,
        "y": 0
      }
    },
    {
      "type": "place",
      "pieceId": "piece.30",
      "origin": {
        "x": 3,
        "y": 1
      }
    },
    {
      "type": "place",
      "pieceId": "piece.31",
      "origin": {
        "x": 4,
        "y": 1
      }
    }
  ],
  "small_parcels.orders": [
    {
      "type": "place",
      "pieceId": "piece.3",
      "origin": {
        "x": 1,
        "y": 1
      }
    },
    {
      "type": "place",
      "pieceId": "piece.5",
      "origin": {
        "x": 2,
        "y": 1
      }
    },
    {
      "type": "place",
      "pieceId": "piece.6",
      "origin": {
        "x": 1,
        "y": 1
      }
    },
    {
      "type": "place",
      "pieceId": "piece.4",
      "origin": {
        "x": 2,
        "y": 1
      }
    },
    {
      "type": "place",
      "pieceId": "piece.9",
      "origin": {
        "x": 1,
        "y": 1
      }
    },
    {
      "type": "place",
      "pieceId": "piece.8",
      "origin": {
        "x": 4,
        "y": 1
      }
    },
    {
      "type": "place",
      "pieceId": "piece.13",
      "origin": {
        "x": 2,
        "y": 2
      }
    },
    {
      "type": "place",
      "pieceId": "piece.12",
      "origin": {
        "x": 1,
        "y": 1
      }
    },
    {
      "type": "place",
      "pieceId": "piece.11",
      "origin": {
        "x": 1,
        "y": 2
      }
    },
    {
      "type": "place",
      "pieceId": "piece.16",
      "origin": {
        "x": 5,
        "y": 2
      }
    },
    {
      "type": "place",
      "pieceId": "piece.18",
      "origin": {
        "x": 1,
        "y": 3
      }
    },
    {
      "type": "upgrade",
      "upgradeId": "small_parcels"
    },
    {
      "type": "place",
      "pieceId": "piece.15",
      "origin": {
        "x": 4,
        "y": 2
      }
    },
    {
      "type": "place",
      "pieceId": "piece.20",
      "origin": {
        "x": 1,
        "y": 1
      }
    },
    {
      "type": "chooseCleanup",
      "branch": "orders"
    },
    {
      "type": "place",
      "pieceId": "piece.25",
      "origin": {
        "x": 1,
        "y": 1
      }
    },
    {
      "type": "place",
      "pieceId": "piece.26",
      "origin": {
        "x": 0,
        "y": 0
      }
    },
    {
      "type": "place",
      "pieceId": "piece.27",
      "origin": {
        "x": 1,
        "y": 4
      }
    },
    {
      "type": "place",
      "pieceId": "piece.29",
      "origin": {
        "x": 1,
        "y": 0
      }
    },
    {
      "type": "place",
      "pieceId": "piece.30",
      "origin": {
        "x": 3,
        "y": 1
      }
    },
    {
      "type": "place",
      "pieceId": "piece.31",
      "origin": {
        "x": 4,
        "y": 1
      }
    }
  ],
  "candidate_slots.placements": [
    {
      "type": "place",
      "pieceId": "piece.3",
      "origin": {
        "x": 1,
        "y": 1
      }
    },
    {
      "type": "place",
      "pieceId": "piece.5",
      "origin": {
        "x": 2,
        "y": 1
      }
    },
    {
      "type": "place",
      "pieceId": "piece.6",
      "origin": {
        "x": 1,
        "y": 1
      }
    },
    {
      "type": "place",
      "pieceId": "piece.4",
      "origin": {
        "x": 2,
        "y": 1
      }
    },
    {
      "type": "place",
      "pieceId": "piece.9",
      "origin": {
        "x": 1,
        "y": 1
      }
    },
    {
      "type": "place",
      "pieceId": "piece.8",
      "origin": {
        "x": 4,
        "y": 1
      }
    },
    {
      "type": "place",
      "pieceId": "piece.13",
      "origin": {
        "x": 2,
        "y": 2
      }
    },
    {
      "type": "place",
      "pieceId": "piece.12",
      "origin": {
        "x": 1,
        "y": 1
      }
    },
    {
      "type": "place",
      "pieceId": "piece.11",
      "origin": {
        "x": 1,
        "y": 2
      }
    },
    {
      "type": "place",
      "pieceId": "piece.16",
      "origin": {
        "x": 5,
        "y": 2
      }
    },
    {
      "type": "place",
      "pieceId": "piece.18",
      "origin": {
        "x": 1,
        "y": 3
      }
    },
    {
      "type": "upgrade",
      "upgradeId": "candidate_slots"
    },
    {
      "type": "place",
      "pieceId": "piece.15",
      "origin": {
        "x": 4,
        "y": 2
      }
    },
    {
      "type": "place",
      "pieceId": "piece.20",
      "origin": {
        "x": 1,
        "y": 1
      }
    },
    {
      "type": "chooseCleanup",
      "branch": "placements"
    },
    {
      "type": "place",
      "pieceId": "piece.26",
      "origin": {
        "x": 0,
        "y": 0
      }
    },
    {
      "type": "place",
      "pieceId": "piece.21",
      "origin": {
        "x": 0,
        "y": 0
      }
    },
    {
      "type": "place",
      "pieceId": "piece.27",
      "origin": {
        "x": 3,
        "y": 1
      }
    },
    {
      "type": "place",
      "pieceId": "piece.29",
      "origin": {
        "x": 1,
        "y": 3
      }
    },
    {
      "type": "place",
      "pieceId": "piece.31",
      "origin": {
        "x": 5,
        "y": 1
      }
    },
    {
      "type": "place",
      "pieceId": "piece.32",
      "origin": {
        "x": 1,
        "y": 3
      }
    }
  ],
  "candidate_slots.orders": [
    {
      "type": "place",
      "pieceId": "piece.3",
      "origin": {
        "x": 1,
        "y": 1
      }
    },
    {
      "type": "place",
      "pieceId": "piece.5",
      "origin": {
        "x": 2,
        "y": 1
      }
    },
    {
      "type": "place",
      "pieceId": "piece.6",
      "origin": {
        "x": 1,
        "y": 1
      }
    },
    {
      "type": "place",
      "pieceId": "piece.4",
      "origin": {
        "x": 2,
        "y": 1
      }
    },
    {
      "type": "place",
      "pieceId": "piece.9",
      "origin": {
        "x": 1,
        "y": 1
      }
    },
    {
      "type": "place",
      "pieceId": "piece.8",
      "origin": {
        "x": 4,
        "y": 1
      }
    },
    {
      "type": "place",
      "pieceId": "piece.13",
      "origin": {
        "x": 2,
        "y": 2
      }
    },
    {
      "type": "place",
      "pieceId": "piece.12",
      "origin": {
        "x": 1,
        "y": 1
      }
    },
    {
      "type": "place",
      "pieceId": "piece.11",
      "origin": {
        "x": 1,
        "y": 2
      }
    },
    {
      "type": "place",
      "pieceId": "piece.16",
      "origin": {
        "x": 5,
        "y": 2
      }
    },
    {
      "type": "place",
      "pieceId": "piece.18",
      "origin": {
        "x": 1,
        "y": 3
      }
    },
    {
      "type": "upgrade",
      "upgradeId": "candidate_slots"
    },
    {
      "type": "place",
      "pieceId": "piece.15",
      "origin": {
        "x": 4,
        "y": 2
      }
    },
    {
      "type": "place",
      "pieceId": "piece.20",
      "origin": {
        "x": 1,
        "y": 1
      }
    },
    {
      "type": "chooseCleanup",
      "branch": "orders"
    },
    {
      "type": "place",
      "pieceId": "piece.26",
      "origin": {
        "x": 0,
        "y": 0
      }
    },
    {
      "type": "place",
      "pieceId": "piece.21",
      "origin": {
        "x": 0,
        "y": 0
      }
    },
    {
      "type": "place",
      "pieceId": "piece.27",
      "origin": {
        "x": 3,
        "y": 1
      }
    },
    {
      "type": "place",
      "pieceId": "piece.29",
      "origin": {
        "x": 1,
        "y": 3
      }
    },
    {
      "type": "place",
      "pieceId": "piece.31",
      "origin": {
        "x": 5,
        "y": 1
      }
    },
    {
      "type": "place",
      "pieceId": "piece.32",
      "origin": {
        "x": 1,
        "y": 3
      }
    }
  ]
}
};
