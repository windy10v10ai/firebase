'use client';
import { useTranslations } from 'next-intl';
import { IdcardOutlined, AccountBookOutlined } from '@ant-design/icons';
import { Form, Input, Button, Spin } from 'antd';
import React, { useState, useEffect } from 'react';
import { submmitBtnDisableStyle, manualActiveContentStyle } from '../../style/CSSProperties';
import axios from 'axios';
import ActiveResult from './ActiveResult';

interface ManualActiveProps {
  activeType: string;
}

// const successResponse = {
//   data: {
//     steamId: 1234567890,
//     outTradeNo: '12345678901234567890123456',
//     result: true,
//     error_code: '',
//   },
// };

// const failResponse = {
//   data: {
//     steamId: 1234567890,
//     outTradeNo: '12345678901234567890123456',
//     result: false,
//     error_code: 'A01',
//   },
// };

// function fetchData() {
//   // 直接返回 mock 数据（替换真实的 axios 调用）
//   return Promise.resolve(successResponse);
//   // return Promise.resolve(failResponse);
// }

const formItemLayout = {
  labelCol: {
    xs: { span: 24 },
    sm: { span: 6 },
  },
  wrapperCol: {
    xs: { span: 24 },
    sm: { span: 14 },
  },
};

const ManualActive: React.FC<ManualActiveProps> = (props) => {
  const t = useTranslations('manualActive');
  const [steamId, setSteamId] = useState('');
  const [sorderId, setOrderId] = useState('');
  const [submitButtonEnable, setSubmitButtonEnable] = useState<boolean>(false);
  const [requestCommited, setRequestCommited] = useState<boolean>(false);
  const [activeStatus, setActiveStatus] = useState<boolean>(false);
  const [activeErrmsg, setActiveErrmsg] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [mounted, setMounted] = useState(false);

  const [form] = Form.useForm();
  const values = Form.useWatch([], form);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted) {
      form
        .validateFields({ validateOnly: true })
        .then(() => setSubmitButtonEnable(true))
        .catch(() => setSubmitButtonEnable(false));
    }
  }, [form, values, mounted]);

  const setActiveResult = (success: boolean) => {
    setActiveStatus(success);
    setRequestCommited(true);
  };

  const requestActive = async () => {
    var requestUrl = '';
    if (props.activeType === 'afdian') {
      requestUrl = '/api/afdian';
    }

    await axios
      .post(requestUrl, {
        steamId: Number(steamId),
        outTradeNo: sorderId,
      })
      .then((response) => {
        if (response.data.result) {
          setActiveResult(true);
        } else {
          setActiveResult(false);
        }
      })
      .catch((e) => {
        // API调用失败
        setActiveErrmsg(e.message);
        setActiveResult(false);
      })
      .finally(() => {
        // 关闭loading
        setIsLoading(false);
      });
  };

  const onFinish = () => {
    setIsLoading(true);
    requestActive();
  };

  if (!mounted) {
    return null;
  }

  return (
    <>
      {isLoading ? <Spin fullscreen size="large" /> : null}
      <div className="space-y-8" style={manualActiveContentStyle}>
        {!requestCommited ? (
          <>
            <h1 className="title-primary mb-6">
              {props.activeType === 'afdian' ? t('afdianTitle') : ''}
            </h1>
            <p className="text-content mb-8">
              {props.activeType === 'afdian' ? t('afdianDescription') : ''}
            </p>

            <Form form={form} {...formItemLayout} style={{ maxWidth: 600 }} onFinish={onFinish}>
              <Form.Item
                label={<label style={{ color: 'white' }}>{t('input.steamId.title')}</label>}
                name={'steamId'}
                hasFeedback
                rules={[
                  {
                    required: true,
                    message: t('input.steamId.help'),
                    type: 'string',
                    max: 10,
                    pattern: /^[0-9]+$/,
                  },
                ]}
              >
                <Input
                  value={steamId}
                  onChange={(e) => setSteamId(e.target.value)}
                  placeholder={t('input.steamId.placeholder')}
                  prefix={<IdcardOutlined />}
                  id="inputSteamId"
                  allowClear
                  showCount
                />
              </Form.Item>

              <Form.Item
                label={
                  <label style={{ color: 'white' }}>
                    {props.activeType === 'afdian' ? t('input.afdianOrderId.title') : ''}
                  </label>
                }
                name={props.activeType === 'afdian' ? 'afdianOrderId' : ''}
                hasFeedback
                rules={[
                  {
                    required: true,
                    message: props.activeType === 'afdian' ? t('input.afdianOrderId.help') : '',
                    type: 'string',
                    min: 26,
                    max: 30,
                    pattern: /^[0-9]+$/,
                  },
                ]}
              >
                <Input
                  value={sorderId}
                  onChange={(e) => setOrderId(e.target.value)}
                  placeholder={
                    props.activeType === 'afdian' ? t('input.afdianOrderId.placeholder') : ''
                  }
                  prefix={<AccountBookOutlined />}
                  id={props.activeType === 'afdian' ? 'inputAfdianOrderId' : ''}
                  allowClear
                  showCount
                />
              </Form.Item>

              <Form.Item label={null}>
                <Button
                  type="primary"
                  htmlType="submit"
                  disabled={!submitButtonEnable}
                  style={{ ...(!submitButtonEnable ? submmitBtnDisableStyle : {}) }}
                >
                  {t('submitButton.buttonText')}
                </Button>
              </Form.Item>
            </Form>
          </>
        ) : (
          <ActiveResult
            activeType={props.activeType}
            result={activeStatus}
            errorMsg={activeErrmsg}
            setRequestCommited={setRequestCommited}
          />
        )}
      </div>
    </>
  );
};

export default ManualActive;
