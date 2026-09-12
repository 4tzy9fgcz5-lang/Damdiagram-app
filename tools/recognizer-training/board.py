"""Python-spiegel van src/core/board.js (alleen wat de generator nodig heeft)."""
import random

FIELD_COUNT = 50
WHITE_PIECE, BLACK_PIECE, WHITE_KING, BLACK_KING = "wp", "bp", "wk", "bk"


def field_to_coord(field):
    index = field - 1
    row = index // 5
    pos = index % 5
    col = pos * 2 + (1 if row % 2 == 0 else 0)
    return row, col


def is_white(piece):
    return piece in (WHITE_PIECE, WHITE_KING)


def is_king(piece):
    return piece in (WHITE_KING, BLACK_KING)


def random_board(rng, min_pieces=2, max_pieces=40, king_fraction=0.12, empty_board_chance=0.03):
    board = {f: None for f in range(1, FIELD_COUNT + 1)}
    if rng.random() < empty_board_chance:
        return board
    n = rng.randint(min_pieces, max_pieces)
    fields = list(range(1, FIELD_COUNT + 1))
    rng.shuffle(fields)
    chosen = fields[:n]
    for f in chosen:
        white = rng.random() < 0.5
        king = rng.random() < king_fraction
        if white:
            board[f] = WHITE_KING if king else WHITE_PIECE
        else:
            board[f] = BLACK_KING if king else BLACK_PIECE
    return board


def label_for(piece):
    if piece is None:
        return "empty"
    return "wit" if is_white(piece) else "zwart"
