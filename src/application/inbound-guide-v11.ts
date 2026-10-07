import type { InboundCommandV11 } from '../domain/v11/types.ts';

/** Authored from real seed 1 reducer steps: both phase-two cleanup choices lead through rush 3, 2, 1, waste and a later sweep. */
export const INBOUND_GUIDE_V11: { readonly seed: number; readonly branches: Readonly<Record<'orders' | 'placements', readonly InboundCommandV11[]>> } = {
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
          "x": 1,
          "y": 2
        }
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
          "x": 1,
          "y": 3
        }
      },
      {
        "type": "place",
        "pieceId": "piece.27",
        "origin": {
          "x": 1,
          "y": 2
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
        "pieceId": "piece.22",
        "origin": {
          "x": 2,
          "y": 2
        }
      },
      {
        "type": "place",
        "pieceId": "piece.32",
        "origin": {
          "x": 3,
          "y": 2
        }
      },
      {
        "type": "place",
        "pieceId": "piece.34",
        "origin": {
          "x": 2,
          "y": 2
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
          "x": 1,
          "y": 2
        }
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
          "x": 1,
          "y": 3
        }
      },
      {
        "type": "place",
        "pieceId": "piece.27",
        "origin": {
          "x": 1,
          "y": 2
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
        "pieceId": "piece.22",
        "origin": {
          "x": 2,
          "y": 2
        }
      }
    ]
  }
};
