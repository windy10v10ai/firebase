"use client";

import React from 'react';

export default function Home() {
  return (
    <div className="space-y-12">
      {/* 欢迎区域 */}
      <section className="text-center py-12">
        <h1 className="text-4xl font-bold mb-4 text-white">DOTA2 10v10 AI 自定义地图</h1>
      </section>

      {/* 链接区域 */}
      <section className="max-w-2xl mx-auto">
        <div className="space-y-6">
          <a 
            href="https://steamcommunity.com/sharedfiles/filedetails/?id=2307479570" 
            target="_blank" 
            rel="noopener noreferrer"
            className="block p-6 bg-black/50 backdrop-blur-sm rounded-lg border border-gray-800 hover:border-blue-500 transition-all transform hover:-translate-y-1"
          >
            <h2 className="text-2xl font-bold mb-2 text-blue-400">Steam Workshop</h2>
            <p className="text-gray-300">在Steam Workshop上体验我们的地图，您的支持是我们持续更新的动力</p>
          </a>

          <a 
            href="https://github.com/windy10v10ai/game" 
            target="_blank" 
            rel="noopener noreferrer"
            className="block p-6 bg-black/50 backdrop-blur-sm rounded-lg border border-gray-800 hover:border-blue-500 transition-all transform hover:-translate-y-1"
          >
            <h2 className="text-2xl font-bold mb-2 text-blue-400">GitHub</h2>
            <p className="text-gray-300">查看项目源代码和更新日志</p>
          </a>
        </div>
      </section>

      {/* 项目介绍 */}
      <section className="bg-black/50 backdrop-blur-sm p-8 rounded-lg border border-gray-800">
        <h2 className="text-2xl font-bold mb-6 text-center text-blue-400">关于项目</h2>
        <div className="max-w-3xl mx-auto">
          <p className="text-gray-300 text-center">
            这是一个DOTA2自定义地图项目，为您带来全新的10v10AI对战体验。<br/>
            我们会持续优化和更新，您的支持是我们不断进步的动力。
          </p>
        </div>
      </section>
    </div>
  )
}
