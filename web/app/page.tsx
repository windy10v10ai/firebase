"use client";

import React, { useState } from 'react';

const HomePage = () => {
  const [input1, setInput1] = useState('');
  const [input2, setInput2] = useState('');

  return (
    <div>
      <h2>Welcome to the Home Page</h2>
      <form>
        <div>
          <label htmlFor="input1">Input 1:</label>
          <input
            type="text"
            id="input1"
            value={input1}
            onChange={(e) => setInput1(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="input2">Input 2:</label>
          <input
            type="text"
            id="input2"
            value={input2}
            onChange={(e) => setInput2(e.target.value)}
          />
        </div>
      </form>
    </div>
  );
};

export default HomePage;
