import React, { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { SmileOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { Button, Result } from 'antd';
import { redirect } from 'next/navigation';

interface RegistResultProps {
  result: boolean;
  errorCode?: string;
}

const RegistResult: React.FC<RegistResultProps> = (props) => {
  const t = useTranslations('afdianRegist');
  const [message, setMessage] = React.useState<string>('');
  const [btnText, setBtnText] = React.useState<string>('');

  const getResultMessage = () => {
    if (props.result) {
      setMessage(t('registResult.success.message'));
      setBtnText(t('registResult.success.btnText'));
    } else {
      if (props.result === false && props.errorCode) {
        setMessage('根据错误码进行处理（TODO）');
      } else {
        setMessage(t('registResult.error.message'));
      }
      setBtnText(t('registResult.error.btnText'));
    }
  };

  const handleClidk = () => {
    console.log('handleClidk:', props.result);
    if (props.result) {
      redirect('/');
    } else {
      window.location.reload();
    }
  };

  useEffect(() => {
    getResultMessage();
  }, [props.result]);

  return (
    <Result
      status={props.result ? 'success' : 'warning'}
      icon={props.result ? <SmileOutlined /> : <InfoCircleOutlined />}
      title={<div style={{ color: 'white' }}>{message}</div>}
      extra={
        <Button type="primary" onClick={handleClidk}>
          {btnText}
        </Button>
      }
    />
  );
};

export default RegistResult;
