import React, { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { SmileOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { Button, Result } from 'antd';
import { useRouter } from 'next/navigation';

interface ActiveResultProps {
  activeType: string;
  result: boolean;
  errorMsg?: string;
}

const ActiveResult: React.FC<ActiveResultProps> = (props) => {
  const t = useTranslations('manualActive');
  const router = useRouter();
  const [message, setMessage] = React.useState<string>('');
  const [btnText, setBtnText] = React.useState<string>('');

  const getResultMessage = () => {
    if (props.result) {
      setMessage(t('avticeResult.success.message'));
      setBtnText(t('avticeResult.success.btnText'));
    } else {
      if (props.result === false && props.errorMsg) {
        setMessage(props.errorMsg);
      } else {
        setMessage(props.activeType === 'afdian' ? t('avticeResult.error.afdianMessage') : '');
      }
      setBtnText(t('avticeResult.error.btnText'));
    }
  };

  const handleClick = () => {
    if (props.result) {
      router.push('/');
    } else {
      router.refresh();
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
        <Button type="primary" onClick={handleClick}>
          {btnText}
        </Button>
      }
    />
  );
};

export default ActiveResult;
