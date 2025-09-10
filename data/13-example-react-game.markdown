```yaml
---
title: React Game Example
description: A guide to building an interactive game using React and Canvas for web-based game development.
tags: [React, JavaScript, Canvas, game development, web games]
priority: PRIORITY
language: he
---
```

# דוגמה למשחק ב-React

## Introduction
Building interactive games in React combines the power of component-based architecture with dynamic rendering capabilities, making it an excellent choice for web-based game development. React’s state management and lifecycle methods allow developers to create engaging, maintainable games. This guide demonstrates how to build a simple interactive game (a basic "Pong" game) using React and the Canvas API, highlighting how React can manage game state and user interactions effectively.

## General Explanation
Pong is a classic two-player game where players control paddles to hit a ball back and forth, scoring points when the opponent misses. Key concepts include:
- **React Components**: Encapsulate game logic and rendering in reusable components.
- **Canvas API**: Used for rendering the game’s graphics (paddles, ball, and score).
- **State Management**: React’s `useState` and `useEffect` hooks manage game state (e.g., ball position, scores) and the game loop.
- **User Input**: Keyboard events control paddle movement.
- **Game Loop**: A loop updates the game state and redraws the canvas at regular intervals.

This guide uses React with a CDN-hosted setup (React, ReactDOM, and Babel) for simplicity, combined with Tailwind CSS for styling, as per the provided guidelines.

## Practical Usage Examples
Below is an implementation of a Pong game in React. The game includes two paddles, a ball, and a scoring system, rendered on a canvas.

```javascript
<!DOCTYPE html>
<html>
<head>
  <title>Pong Game in React</title>
  <script src="https://cdn.jsdelivr.net/npm/react@18.2.0/umd/react.development.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/react-dom@18.2.0/umd/react-dom.development.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/@babel/standalone@7.20.6/Babel.min.js"></script>
  <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">
</head>
<body>
  <div id="root" class="flex justify-center items-center h-screen bg-gray-900"></div>

  <script type="text/babel">
    const { useState, useEffect, useRef } = React;

    function Pong() {
      const canvasRef = useRef(null);
      const [score, setScore] = useState({ player1: 0, player2: 0 });

      // Game state
      const paddleHeight = 100, paddleWidth = 10, ballSize = 10;
      let paddle1Y = 150, paddle2Y = 150, ballX = 400, ballY = 200;
      let ballSpeedX = 5, ballSpeedY = 3;

      useEffect(() => {
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');
        context.scale(1, 1);

        // Game loop
        const gameLoop = () => {
          // Update ball position
          ballX += ballSpeedX;
          ballY += ballSpeedY;

          // Ball collision with top/bottom
          if (ballY < 0 || ballY > canvas.height) ballSpeedY = -ballSpeedY;

          // Ball collision with paddles
          if (
            (ballX < paddleWidth && ballY > paddle1Y && ballY < paddle1Y + paddleHeight) ||
            (ballX > canvas.width - paddleWidth - ballSize && ballY > paddle2Y && ballY < paddle2Y + paddleHeight)
          ) {
            ballSpeedX = -ballSpeedX;
          }

          // Score points
          if (ballX < 0) {
            setScore(prev => ({ ...prev, player2: prev.player2 + 1 }));
            resetBall();
          } else if (ballX > canvas.width) {
            setScore(prev => ({ ...prev, player1: prev.player1 + 1 }));
            resetBall();
          }

          // Draw
          context.fillStyle = '#000';
          context.fillRect(0, 0, canvas.width, canvas.height);
          context.fillStyle = '#fff';
          context.fillRect(0, paddle1Y, paddleWidth, paddleHeight); // Paddle 1
          context.fillRect(canvas.width - paddleWidth, paddle2Y, paddleWidth, paddleHeight); // Paddle 2
          context.fillRect(ballX, ballY, ballSize, ballSize); // Ball
          context.font = '20px Arial';
          context.fillText(`Player 1: ${score.player1}`, 50, 30);
          context.fillText(`Player 2: ${score.player2}`, canvas.width - 150, 30);
        };

        // Reset ball
        const resetBall = () => {
          ballX = canvas.width / 2;
          ballY = canvas.height / 2;
          ballSpeedX = -ballSpeedX;
        };

        // Keyboard controls
        const handleKeyDown = (e) => {
          if (e.key === 'w' && paddle1Y > 0) paddle1Y -= 20;
          if (e.key === 's' && paddle1Y < canvas.height - paddleHeight) paddle1Y += 20;
          if (e.key === 'ArrowUp' && paddle2Y > 0) paddle2Y -= 20;
          if (e.key === 'ArrowDown' && paddle2Y < canvas.height - paddleHeight) paddle2Y += 20;
        };

        document.addEventListener('keydown', handleKeyDown);
        const interval = setInterval(gameLoop, 1000 / 60); // 60 FPS

        return () => {
          document.removeEventListener('keydown', handleKeyDown);
          clearInterval(interval);
        };
      }, [score]);

      return (
        <div className="flex flex-col items-center">
          <h1 className="text-3xl text-white mb-4">Pong Game</h1>
          <canvas ref={canvasRef} width={800} height={400} className="border-2 border-white" />
        </div>
      );
    }

    ReactDOM.render(<Pong />, document.getElementById('root'));
  </script>
</body>
</html>
```

This code creates a Pong game where players use `w`/`s` (Player 1) and `ArrowUp`/`ArrowDown` (Player 2) to move paddles. The game updates at 60 FPS, handles collisions, and tracks scores using React state.

### Integration with Other Projects
As a PRIORITY tutorial, let’s connect this to other projects. The Pong game can be part of a larger game platform built with React. For example, you can integrate it with the Tetris game (from **12-tutorial-tetris.md**) by creating a game selection menu:

```javascript
import React from 'react';
import Pong from './Pong';
import Tetris from './Tetris';

function GamePlatform() {
  const [game, setGame] = React.useState(null);

  return (
    <div className="flex flex-col items-center p-4 bg-gray-900 min-h-screen">
      <h1 className="text-4xl text-white mb-4">Game Platform</h1>
      {!game && (
        <div className="space-x-4">
          <button onClick={() => setGame('pong')} className="px-4 py-2 bg-blue-500 text-white rounded">Play Pong</button>
          <button onClick={() => setGame('tetris')} className="px-4 py-2 bg-green-500 text-white rounded">Play Tetris</button>
        </div>
      )}
      {game === 'pong' && <Pong />}
      {game === 'tetris' && <Tetris />}
    </div>
  );
}
```

This structure allows users to switch between games, reusing the modular Pong and Tetris components.

## Best Practices
- **Component Reusability**: Encapsulate game logic in a single component for easy integration into larger apps.
- **State Management**: Use `useState` for dynamic game elements (e.g., scores) and `useRef` for canvas references.
- **Performance**: Use `setInterval` or `requestAnimationFrame` for the game loop, but clean up intervals in `useEffect`’s cleanup function to avoid memory leaks.
- **Styling**: Leverage Tailwind CSS for responsive, clean UI without relying on `<form>` elements (as per guidelines).
- **Accessibility**: Ensure keyboard controls are intuitive and consider adding touch controls for mobile.
- **Modularity**: Separate game logic (e.g., collision detection) into pure functions for testability.

This guide provides a foundation for building interactive games in React, with Pong as a practical example.