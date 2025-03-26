import React from 'react';
import Image from 'next/image';

interface ProductDisplayProps {
  title: string;
  description: string;
  benefits: string[];
  subscribeText: string;
  subscribeLink: string;
  imagePath: string;
}

export default function ProductDisplay({
  title,
  description,
  benefits,
  subscribeText,
  subscribeLink,
  imagePath
}: ProductDisplayProps) {
  return (
    <div className="bg-gray-900 rounded-lg overflow-hidden border border-gray-800 shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="lg:grid lg:grid-cols-2 lg:gap-12 items-center">
          {/* 左侧：图片 */}
          <div className="relative h-[280px] w-[280px] mx-auto mb-8 lg:mb-0">
            <Image
              src={imagePath}
              alt={title}
              fill
              className="object-contain rounded-lg"
              priority
            />
          </div>

          {/* 右侧：内容 */}
          <div className="space-y-8">
            <h2 className="text-3xl font-bold text-blue-400 mb-4">{title}</h2>
            
            <p className="text-gray-300 text-lg whitespace-pre-line">
              {description}
            </p>
            
            <ul className="space-y-4">
              {benefits.map((benefit, index) => (
                <li key={index} className="flex items-start text-gray-300">
                  <span className="text-blue-400 mr-2">•</span>
                  <span>{benefit}</span>
                </li>
              ))}
            </ul>

            <div className="pt-6">
              <a
                href={subscribeLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block bg-blue-500 hover:bg-blue-600 text-white font-semibold px-8 py-3 rounded-lg transition-colors duration-200 transform hover:scale-105"
              >
                {subscribeText}
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 