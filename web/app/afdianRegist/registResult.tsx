import React from 'react';
import { useTranslations } from 'next-intl';
import { SmileOutlined } from '@ant-design/icons';
import { Button, Result } from 'antd';

const RegistResult: React.FC = () => {
  const t = useTranslations('afdianRegist');

  return (
    <Result
      icon={<SmileOutlined />}
      title={<div style={{ color: 'white' }}>{t('registResult.success.description')}</div>}
      extra={<Button type="primary">{t('registResult.success.btnText')}</Button>}
    />
  );
};

export default RegistResult;
