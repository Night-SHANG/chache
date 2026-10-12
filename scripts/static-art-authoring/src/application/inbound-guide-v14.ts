import type { InboundCommandV14 } from '../domain/v14/types.ts';

/** Real seed-1 adaptive generation: both branches place a multi-cell rush, observe 3/2/1, expiration and a later cleanup. */
export const INBOUND_GUIDE_V14: { readonly seed: number; readonly branches: Readonly<Record<'orders' | 'placements', readonly InboundCommandV14[]>> } = {
  "seed": 1,
  "branches": {
    "orders": [
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
        "pieceId": "piece.4",
        "origin": {
          "x": 1,
          "y": 1
        }
      },
      {
        "type": "place",
        "pieceId": "piece.8",
        "origin": {
          "x": 3,
          "y": 1
        }
      },
      {
        "type": "place",
        "pieceId": "piece.9",
        "origin": {
          "x": 2,
          "y": 2
        }
      },
      {
        "type": "place",
        "pieceId": "piece.10",
        "origin": {
          "x": 3,
          "y": 2
        }
      },
      {
        "type": "place",
        "pieceId": "piece.12",
        "origin": {
          "x": 3,
          "y": 1
        }
      },
      {
        "type": "place",
        "pieceId": "piece.14",
        "origin": {
          "x": 3,
          "y": 1
        }
      },
      {
        "type": "place",
        "pieceId": "piece.16",
        "origin": {
          "x": 3,
          "y": 1
        }
      },
      {
        "type": "place",
        "pieceId": "piece.17",
        "origin": {
          "x": 1,
          "y": 3
        }
      },
      {
        "type": "place",
        "pieceId": "piece.5",
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
        "pieceId": "piece.19",
        "origin": {
          "x": 4,
          "y": 4
        }
      },
      {
        "type": "place",
        "pieceId": "piece.24",
        "origin": {
          "x": 2,
          "y": 4
        }
      },
      {
        "type": "place",
        "pieceId": "piece.26",
        "origin": {
          "x": 3,
          "y": 3
        }
      },
      {
        "type": "place",
        "pieceId": "piece.22",
        "origin": {
          "x": 4,
          "y": 3
        }
      },
      {
        "type": "place",
        "pieceId": "piece.27",
        "origin": {
          "x": 3,
          "y": 3
        }
      },
      {
        "type": "place",
        "pieceId": "piece.7",
        "origin": {
          "x": 4,
          "y": 3
        }
      },
      {
        "type": "place",
        "pieceId": "piece.30",
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
          "y": 2
        }
      },
      {
        "type": "place",
        "pieceId": "piece.34",
        "origin": {
          "x": 4,
          "y": 2
        }
      },
      {
        "type": "place",
        "pieceId": "piece.36",
        "origin": {
          "x": 2,
          "y": 3
        }
      },
      {
        "type": "place",
        "pieceId": "piece.33",
        "origin": {
          "x": 3,
          "y": 3
        }
      },
      {
        "type": "place",
        "pieceId": "piece.29",
        "origin": {
          "x": 1,
          "y": 1
        }
      },
      {
        "type": "place",
        "pieceId": "piece.40",
        "origin": {
          "x": 2,
          "y": 2
        }
      },
      {
        "type": "place",
        "pieceId": "piece.42",
        "origin": {
          "x": 4,
          "y": 1
        }
      },
      {
        "type": "place",
        "pieceId": "piece.43",
        "origin": {
          "x": 3,
          "y": 2
        }
      },
      {
        "type": "place",
        "pieceId": "piece.44",
        "origin": {
          "x": 1,
          "y": 0
        }
      },
      {
        "type": "place",
        "pieceId": "piece.37",
        "origin": {
          "x": 1,
          "y": 5
        }
      },
      {
        "type": "place",
        "pieceId": "piece.48",
        "origin": {
          "x": 4,
          "y": 0
        }
      },
      {
        "type": "place",
        "pieceId": "piece.46",
        "origin": {
          "x": 5,
          "y": 4
        }
      },
      {
        "type": "place",
        "pieceId": "piece.50",
        "origin": {
          "x": 5,
          "y": 5
        }
      },
      {
        "type": "place",
        "pieceId": "piece.39",
        "origin": {
          "x": 4,
          "y": 4
        }
      },
      {
        "type": "place",
        "pieceId": "piece.52",
        "origin": {
          "x": 1,
          "y": 3
        }
      }
    ],
    "placements": [
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
        "pieceId": "piece.4",
        "origin": {
          "x": 1,
          "y": 1
        }
      },
      {
        "type": "place",
        "pieceId": "piece.8",
        "origin": {
          "x": 3,
          "y": 1
        }
      },
      {
        "type": "place",
        "pieceId": "piece.9",
        "origin": {
          "x": 2,
          "y": 2
        }
      },
      {
        "type": "place",
        "pieceId": "piece.10",
        "origin": {
          "x": 3,
          "y": 2
        }
      },
      {
        "type": "place",
        "pieceId": "piece.12",
        "origin": {
          "x": 3,
          "y": 1
        }
      },
      {
        "type": "place",
        "pieceId": "piece.14",
        "origin": {
          "x": 3,
          "y": 1
        }
      },
      {
        "type": "place",
        "pieceId": "piece.16",
        "origin": {
          "x": 3,
          "y": 1
        }
      },
      {
        "type": "place",
        "pieceId": "piece.17",
        "origin": {
          "x": 1,
          "y": 3
        }
      },
      {
        "type": "place",
        "pieceId": "piece.5",
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
        "pieceId": "piece.19",
        "origin": {
          "x": 4,
          "y": 4
        }
      },
      {
        "type": "place",
        "pieceId": "piece.24",
        "origin": {
          "x": 2,
          "y": 4
        }
      },
      {
        "type": "place",
        "pieceId": "piece.26",
        "origin": {
          "x": 3,
          "y": 3
        }
      },
      {
        "type": "place",
        "pieceId": "piece.22",
        "origin": {
          "x": 4,
          "y": 3
        }
      },
      {
        "type": "place",
        "pieceId": "piece.27",
        "origin": {
          "x": 3,
          "y": 3
        }
      },
      {
        "type": "place",
        "pieceId": "piece.7",
        "origin": {
          "x": 4,
          "y": 3
        }
      },
      {
        "type": "place",
        "pieceId": "piece.30",
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
          "y": 2
        }
      },
      {
        "type": "place",
        "pieceId": "piece.34",
        "origin": {
          "x": 4,
          "y": 2
        }
      },
      {
        "type": "place",
        "pieceId": "piece.36",
        "origin": {
          "x": 2,
          "y": 3
        }
      },
      {
        "type": "place",
        "pieceId": "piece.33",
        "origin": {
          "x": 3,
          "y": 3
        }
      },
      {
        "type": "place",
        "pieceId": "piece.29",
        "origin": {
          "x": 1,
          "y": 1
        }
      },
      {
        "type": "place",
        "pieceId": "piece.40",
        "origin": {
          "x": 2,
          "y": 2
        }
      },
      {
        "type": "place",
        "pieceId": "piece.42",
        "origin": {
          "x": 4,
          "y": 1
        }
      },
      {
        "type": "place",
        "pieceId": "piece.43",
        "origin": {
          "x": 3,
          "y": 2
        }
      },
      {
        "type": "place",
        "pieceId": "piece.44",
        "origin": {
          "x": 1,
          "y": 0
        }
      },
      {
        "type": "place",
        "pieceId": "piece.37",
        "origin": {
          "x": 1,
          "y": 5
        }
      },
      {
        "type": "place",
        "pieceId": "piece.48",
        "origin": {
          "x": 5,
          "y": 3
        }
      }
    ]
  }
};
