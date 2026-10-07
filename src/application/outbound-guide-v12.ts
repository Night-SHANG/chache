import type {OutboundToolCommandV12} from '../domain/v12/types.ts';

/** Verified real seed12 placements retain the south entry and teach mixed residue. */
export const OUTBOUND_GUIDE_V12: { readonly seed: number; readonly commands: readonly OutboundToolCommandV12[] } = {
  "seed": 12,
  "commands": [
    {
      "type": "place",
      "pieceId": "piece.2",
      "origin": {
        "x": 0,
        "y": 4
      }
    },
    {
      "type": "place",
      "pieceId": "piece.1",
      "origin": {
        "x": 4,
        "y": 0
      }
    },
    {
      "type": "place",
      "pieceId": "piece.4",
      "origin": {
        "x": 2,
        "y": 2
      }
    },
    {
      "type": "place",
      "pieceId": "piece.6",
      "origin": {
        "x": 7,
        "y": 3
      }
    },
    {
      "type": "place",
      "pieceId": "piece.3",
      "origin": {
        "x": 5,
        "y": 5
      }
    }
  ]
};
