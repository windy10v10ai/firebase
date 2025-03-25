"use client";

import React from 'react';
import Card from './components/Card';
import Section from './components/Section';

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
          <Card 
            href="https://steamcommunity.com/sharedfiles/filedetails/?id=2307479570"
            title="Steam Workshop"
            description="在Steam Workshop订阅我们的地图，您的支持是我们持续更新的动力"
          />

          <Card 
            href="https://github.com/windy10v10ai/game"
            title="GitHub"
            description="查看项目源代码和更新日志，并参与贡献"
          />
        </div>
      </section>

      {/* 项目介绍 */}
      <Section title="关于项目">
        <p className="text-content text-center">
          这是一个DOTA2自定义地图项目，为您带来全新的10v10AI对战体验。<br/>
          您可以订阅会员，解锁更多功能，享受更好的游戏体验。<br/>
          我们会持续优化和更新，您的支持是我们不断进步的动力。
        </p>
      </Section>
    </div>
  )
}
