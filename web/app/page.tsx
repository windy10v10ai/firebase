"use client";

import React from 'react';

export default function Home() {
  return (
    <div className="space-y-12">
      {/* 欢迎区域 */}
      <section className="text-center py-12">
        <h1 className="title-primary mb-4">DOTA2 10v10 AI 自定义地图</h1>
      </section>

      {/* 链接区域 */}
      <section className="max-w-2xl mx-auto">
        <div className="space-y-6">
          <a 
            href="https://steamcommunity.com/sharedfiles/filedetails/?id=2307479570" 
            target="_blank" 
            rel="noopener noreferrer"
            className="block p-6 card-container card-hover"
          >
            <h2 className="title-secondary mb-2">Steam Workshop</h2>
            <p className="text-content">在Steam Workshop订阅我们的地图，您的支持是我们持续更新的动力</p>
          </a>

          <a 
            href="https://github.com/windy10v10ai/game" 
            target="_blank" 
            rel="noopener noreferrer"
            className="block p-6 card-container card-hover"
          >
            <h2 className="title-secondary mb-2">GitHub</h2>
            <p className="text-content">查看项目源代码和更新日志，并参与贡献</p>
          </a>
        </div>
      </section>

      {/* 项目介绍 */}
      <section className="card-container p-8">
        <h2 className="title-secondary mb-6 text-center">关于项目</h2>
        <div className="max-w-3xl mx-auto">
          <p className="text-content text-center">
            这是一个DOTA2自定义地图项目，为您带来全新的10v10AI对战体验。<br/>
            我们会持续优化和更新，您的支持是我们不断进步的动力。
          </p>
        </div>
      </section>
    </div>
  )
}
