import React from 'react';
import Image from 'next/image';

interface ProductDisplayProps {
  title: string;
  description: string;
  benefits: string[];
  subscribeText: string;
  subscribeLink: string;
  imagePath: string;
  note?: string;
}

export default function ProductDisplay({
  title,
  description,
  benefits,
  subscribeText,
  subscribeLink,
  imagePath,
  note
}: ProductDisplayProps) {
  return (
    <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700 shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="lg:grid lg:grid-cols-5 lg:gap-8 items-center">
          {/* 左侧：图片 */}
          <div className="lg:col-span-2">
            <div className="relative h-[200px] w-[200px] mx-auto mb-8 lg:mb-0">
              <Image
                src={imagePath}
                alt={title}
                fill
                sizes="(max-width: 768px) 200px, 200px"
                className="object-contain"
                priority
              />
            </div>
          </div>

          {/* 右侧：内容 */}
          <div className="lg:col-span-3 space-y-6">
            <h2 className="text-2xl font-bold text-blue-400">{title}</h2>
            
            <p className="text-gray-200 text-lg">
              {description}
            </p>
            
            <ul className="space-y-3">
              {benefits.map((benefit, index) => (
                <li key={index} className="flex items-start text-gray-200">
                  <span className="text-blue-400 mr-2">•</span>
                  <span>{benefit}</span>
                </li>
              ))}
            </ul>

            <div className="pt-4 flex flex-col items-start space-y-3">
              <a
                href={subscribeLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block bg-blue-500 hover:bg-blue-600 text-white font-semibold px-8 py-3 rounded-lg transition-colors duration-200 transform hover:scale-105"
              >
                {subscribeText}
              </a>
              {note && (
                <p className="text-gray-400 text-sm">
                  {note}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 