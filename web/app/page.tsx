"use client";

import React, { useState } from 'react';

export default function Home() {
  return (
    <div className="space-y-12">
      {/* 欢迎区域 */}
      <section className="text-center py-12">
        <h1 className="text-4xl font-bold mb-4">欢迎来到数字商品商店</h1>
        <p className="text-xl text-gray-600">发现优质数字商品，开启您的数字之旅</p>
      </section>

      {/* 特色商品区域 */}
      <section>
        <h2 className="text-2xl font-bold mb-6">特色商品</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* 商品卡片将在这里动态生成 */}
        </div>
      </section>

      {/* 为什么选择我们 */}
      <section className="bg-gray-50 p-8 rounded-lg">
        <h2 className="text-2xl font-bold mb-6 text-center">为什么选择我们</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="text-center">
            <h3 className="text-xl font-semibold mb-2">优质商品</h3>
            <p className="text-gray-600">精心挑选的数字商品，品质保证</p>
          </div>
          <div className="text-center">
            <h3 className="text-xl font-semibold mb-2">安全支付</h3>
            <p className="text-gray-600">使用Stripe确保支付安全</p>
          </div>
          <div className="text-center">
            <h3 className="text-xl font-semibold mb-2">即时交付</h3>
            <p className="text-gray-600">支付完成后立即获得商品</p>
          </div>
        </div>
      </section>
    </div>
  )
}
