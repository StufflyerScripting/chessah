const boardElement = document.getElementById("board");
const statusElement = document.getElementById("status");
const movesElement = document.getElementById("moves");

const game = new Chess();

// Initialize the chessboard
const board = Chessboard('board', {
  draggable: true,
  dropOffBoard: 'trash',
  sparePieces: false,
  position: 'start',
  onDrop: onDrop,
  onSnapEnd: () => board.position(game.fen())
});

// Sound effects
const moveSound = new Audio('sounds/move-self.mp3');
const captureSound = new Audio('sounds/capture.mp3');
const checkSound = new Audio('sounds/move-check.mp3');
const checkmateSound = new Audio('sounds/game-end.mp3');
const promotionSound = new Audio('sounds/promote.mp3');
const castlingSound = new Audio('sounds/castle.mp3');

// Opening book
let openingBook = {};
fetch('openings.json')
  .then(response => response.json())
  .then(data => {
    openingBook = data;
    console.log("📘 Opening book loaded:", Object.keys(openingBook).length, "positions");
  });

function isInOpeningBook(fen) {
  return openingBook.hasOwnProperty(fen.split(' ')[0]);
}

function getBookMove(fen) {
  const fenKey = fen.split(' ')[0];
  const moves = openingBook[fenKey];
  return moves ? moves[Math.floor(Math.random() * moves.length)] : null;
}

// Heuristic early game logic
function getHeuristicOpeningMove(game) {
  const legalMoves = game.moves({ verbose: true });
  const centerSquares = ["e5", "d5"];
  const devPieces = ["n", "b"];
  const castleSquares = ["O-O"];

  for (const move of legalMoves) {
    const to = move.to;
    const san = move.san;
    const piece = move.piece;

    if (centerSquares.includes(to) && !wouldBlunder(game, move)) return san;
    if (devPieces.includes(piece) && !wouldBlunder(game, move)) return san;
    if (castleSquares.includes(san)) return san;
  }

  return null;
}

function wouldBlunder(game, move) {
  const testGame = new Chess(game.fen());
  testGame.move(move);
  const toSquare = move.to;

  const opponentColor = game.turn();
  const myColor = testGame.turn();

  const attackers = getAttacksOnSquare(testGame, toSquare, opponentColor);
  const defenders = getAttacksOnSquare(testGame, toSquare, myColor);

  return attackers.length > defenders.length;
}

function getAttacksOnSquare(game, square, color) {
  const moves = game.moves({ verbose: true });
  return moves.filter(move => move.to === square && move.color === color);
}

// AI move generation logic
function makeBestAIMove() {
  if (game.game_over()) return;

  const fen = game.fen();
  const fenKey = fen.split(' ')[0];

  // Opening book
  if (isInOpeningBook(fen)) {
    const bookMove = getBookMove(fen);
    if (bookMove) {
      console.log("📘 Opening book move selected:", bookMove);
      makeAIMove(bookMove);
      return;
    }
  }

  // Heuristic early development
  const heuristicMove = getHeuristicOpeningMove(game);
  if (heuristicMove) {
    console.log("🧠 Heuristic move selected:", heuristicMove);
    makeAIMove(heuristicMove);
    return;
  }

  // Minimax fallback
  const bestMove = minimaxRoot(2, game, true);
  if (bestMove) {
    console.log("🤖 AI selected:", bestMove);
    makeAIMove(bestMove);
  }
}

function makeAIMove(san) {
  const move = game.move(san);
  board.position(game.fen());
  updateMoveHistory(move);
  updateStatus();
  playMoveSound(move);
}

// Minimax functions
function minimaxRoot(depth, game, isMaximizingPlayer) {
  const moves = game.moves();
  let bestMove = null;
  let bestValue = -Infinity;

  for (const move of moves) {
    game.move(move);
    const value = minimax(depth - 1, game, -Infinity, Infinity, !isMaximizingPlayer);
    game.undo();

    if (value > bestValue) {
      bestValue = value;
      bestMove = move;
    }
  }

  return bestMove;
}

function minimax(depth, game, alpha, beta, isMaximizingPlayer) {
  if (depth === 0) return evaluateBoard(game.board());

  const moves = game.moves();

  if (isMaximizingPlayer) {
    let maxEval = -Infinity;
    for (const move of moves) {
      game.move(move);
      const eval = minimax(depth - 1, game, alpha, beta, false);
      game.undo();
      maxEval = Math.max(maxEval, eval);
      alpha = Math.max(alpha, eval);
      if (beta <= alpha) break;
    }
    return maxEval;
  } else {
    let minEval = Infinity;
    for (const move of moves) {
      game.move(move);
      const eval = minimax(depth - 1, game, alpha, beta, true);
      game.undo();
      minEval = Math.min(minEval, eval);
      beta = Math.min(beta, eval);
      if (beta <= alpha) break;
    }
    return minEval;
  }
}

function evaluateBoard(board) {
  let white = 0, black = 0;
  const pieceValues = {
    p: 100,
    n: 320,
    b: 330,
    r: 500,
    q: 900,
    k: 0
  };

  for (let row of board) {
    for (let piece of row) {
      if (!piece) continue;
      const val = pieceValues[piece.type];
      if (piece.color === 'w') white += val;
      else black += val;
    }
  }

  const eval = white - black;
  const penalty = black < white ? (white - black) * 0.1 : 0;
  return -eval - penalty + (Math.random() * 2 - 1); // Add slight randomness
}

// Handle user move
function onDrop(source, target) {
  const move = game.move({
    from: source,
    to: target,
    promotion: 'q'
  });

  if (move === null) return 'snapback';

  updateMoveHistory(move);
  updateStatus();
  playMoveSound(move);

  setTimeout(() => makeBestAIMove(), 400);
}

// UI updates
function updateMoveHistory(move) {
  const moveElement = document.createElement('div');
  moveElement.classList.add('move-history-item');
  moveElement.textContent = `${move.color === 'w' ? 'White' : 'Black'}: ${move.san}`;
  movesElement.appendChild(moveElement);
}

function updateStatus() {
  let status = '';
  if (game.in_checkmate()) {
    status = 'Game over, ' + (game.turn() === 'w' ? 'Black' : 'White') + ' wins by checkmate.';
    checkmateSound.play();
  } else if (game.in_draw()) {
    status = 'Game over, draw.';
  } else {
    status = (game.turn() === 'w' ? 'White' : 'Black') + ' to move';
    if (game.in_check()) {
      status += ' — in check!';
      checkSound.play();
    }
  }

  statusElement.textContent = status;
}

function playMoveSound(move) {
  if (move.captured) captureSound.play();
  else moveSound.play();

  if (move.promotion) promotionSound.play();
  if (move.san.includes('O-O')) castlingSound.play();
}
