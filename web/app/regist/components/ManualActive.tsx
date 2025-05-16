'use client';
import { useTranslations } from 'next-intl';
import { IdcardOutlined, AccountBookOutlined, MailOutlined } from '@ant-design/icons';
import { Form, Input, Button, Spin } from 'antd';
import React, { useState, useEffect } from 'react';
import { submmitBtnDisableStyle, manualActiveContentStyle } from '../../style/CSSProperties';
import axios from 'axios';
import ActiveResult from './ActiveResult';
import { PlatformType } from '../../types/platform';

interface ManualActiveProps {
  activeType: PlatformType;
}

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
  // Afdian: 订单号 ko-fi: 邮箱
  const [platformOrderKey, setPlatformOrderKey] = useState('');
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
    } else if (props.activeType === 'kofi') {
      requestUrl = '/api/kofi';
    }

    await axios
      .post(requestUrl, {
        steamId: Number(steamId),
        ...(props.activeType === 'afdian'
          ? { outTradeNo: platformOrderKey }
          : { email: platformOrderKey }),
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
              {props.activeType === 'afdian' ? t('afdianTitle') : t('kofiTitle')}
            </h1>
            <p className="text-content mb-8">
              {props.activeType === 'afdian' ? t('afdianDescription') : t('kofiDescription')}
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
                extra={
                  <div className="text-sm text-gray-400 mt-2">
                    <a
                      href={
                        props.activeType === 'afdian'
                          ? 'https://afdian.com/p/bfba558c5d9311ed836152540025c377'
                          : 'https://ko-fi.com/post/Membership-Z8Z01CDJLU'
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:text-blue-300"
                    >
                      {t('input.steamId.helpLink')}
                    </a>
                  </div>
                }
                className="mb-8"
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

              {props.activeType === 'afdian' ? (
                <Form.Item
                  label={<label style={{ color: 'white' }}>{t('input.afdianOrderId.title')}</label>}
                  name="afdianOrderId"
                  hasFeedback
                  rules={[
                    {
                      required: true,
                      message: t('input.afdianOrderId.help'),
                      type: 'string',
                      min: 24,
                      max: 30,
                      pattern: /^[0-9]+$/,
                    },
                  ]}
                  extra={
                    <div className="text-sm text-gray-400 mt-2">
                      <a
                        href="https://afdian.com/dashboard/order"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 hover:text-blue-300"
                      >
                        {t('input.afdianOrderId.helpLink')}
                      </a>
                    </div>
                  }
                  className="mb-8"
                >
                  <Input
                    value={platformOrderKey}
                    onChange={(e) => setPlatformOrderKey(e.target.value)}
                    placeholder={t('input.afdianOrderId.placeholder')}
                    prefix={<AccountBookOutlined />}
                    id={'inputAfdianOrderId'}
                    allowClear
                    showCount
                  />
                </Form.Item>
              ) : (
                <Form.Item
                  label={
                    <label style={{ color: 'white' }}>{t('input.kofiMailAddress.title')}</label>
                  }
                  name="kofiMailAddress"
                  hasFeedback
                  rules={[
                    {
                      required: true,
                      message: t('input.kofiMailAddress.help'),
                      type: 'string',
                      min: 6,
                      max: 64,
                      pattern: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
                    },
                  ]}
                  className="mb-8"
                >
                  <Input
                    value={platformOrderKey}
                    onChange={(e) => setPlatformOrderKey(e.target.value)}
                    placeholder={t('input.kofiMailAddress.placeholder')}
                    prefix={<MailOutlined />}
                    id={'inputKofiMailAddress'}
                    allowClear
                    showCount
                  />
                </Form.Item>
              )}

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
