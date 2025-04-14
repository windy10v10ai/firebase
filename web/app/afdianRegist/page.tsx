'use client';
import { useTranslations } from 'next-intl';
import { IdcardOutlined, AccountBookOutlined } from '@ant-design/icons';
import { Form, Input, Button, Spin } from 'antd';
import React, { useState } from 'react';
import { submmitBtnDisableStyle, afdianContentStyle } from '../style/CSSProperties';
import { afdianRegistUrl } from '../../config/constant';
import axios from 'axios';
import RegistResult from './registResult';

const successResponse = {
  data: {
    steamId: 1234567890,
    outTradeNo: '12345678901234567890123456',
    result: true,
    error_code: '',
  },
};

const failResponse = {
  data: {
    steamId: 1234567890,
    outTradeNo: '12345678901234567890123456',
    result: false,
    error_code: 'A01',
  },
};

function fetchData() {
  // 直接返回 mock 数据（替换真实的 axios 调用）
  return Promise.resolve(successResponse);
  // return Promise.resolve(failResponse);
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

const afdianRegistPage: React.FC = () => {
  const t = useTranslations('afdianRegist');
  const [steamId, setSteamId] = useState('');
  const [sorderId, setOrderId] = useState('');
  const [submitButtonEnable, setSubmitButtonEnable] = useState<boolean>(false);
  const [regisCommited, setRegisCommited] = useState<boolean>(false);
  const [registStatus, setRegistStatus] = useState<boolean>(false);
  const [registErrcode, setRegistErrcode] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const [form] = Form.useForm();
  const values = Form.useWatch([], form);

  const setRegistResult = (success: boolean) => {
    setRegistStatus(success);
    setRegisCommited(true);
  };

  const registAfdian = async () => {
    await fetchData()
      // const registResponse = await axios
      //   .post(afdianRegistUrl, {
      //     steamId: Number(steamId),
      //     outTradeNo: sorderId,
      // })
      .then((response) => {
        console.log('registResponse:', response);
        console.log('registResponse:', response);
        if (response.data.steamId === Number(steamId) && response.data.outTradeNo === sorderId) {
          if (response.data.result) {
            setRegistResult(true);
          } else {
            setRegistErrcode(response.data.error_code);
            setRegistResult(false);
          }
        } else {
          // API返回的steamId和outTradeNo与输入不一致
          setRegistResult(false);
        }
      })
      .catch((e) => {
        // API调用失败
        setRegistErrcode(e.error.message);
        setRegistResult(false);
      });
    // 模拟延迟
    // await new Promise((resolve) => setTimeout(resolve, 5000));
    setIsLoading(false);
  };

  const onFinish = () => {
    setIsLoading(true);
    registAfdian();
  };

  React.useEffect(() => {
    console.log('values', values);
    form
      .validateFields({ validateOnly: true })
      .then(() => setSubmitButtonEnable(true))
      .catch(() => setSubmitButtonEnable(false));
  }, [form, values]);

  return (
    <>
      {isLoading ? <Spin fullscreen size="large" /> : null}
      <div className="space-y-8" style={afdianContentStyle}>
        {!regisCommited ? (
          <>
            <h1 className="title-primary mb-6">{t('title')}</h1>
            <p className="text-content mb-8">{t('description')}</p>

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
                label={<label style={{ color: 'white' }}>{t('input.afdianOrderId.title')}</label>}
                name={'afdianOrderId'}
                hasFeedback
                rules={[
                  {
                    required: true,
                    message: t('input.afdianOrderId.help'),
                    type: 'string',
                    min: 26,
                    max: 26,
                    pattern: /^[0-9]+$/,
                  },
                ]}
              >
                <Input
                  value={sorderId}
                  onChange={(e) => setOrderId(e.target.value)}
                  placeholder={t('input.afdianOrderId.placeholder')}
                  prefix={<AccountBookOutlined />}
                  id="inputAfdianOrderId"
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
          <RegistResult result={registStatus} errorCode={registErrcode} />
        )}
      </div>
    </>
  );
};

export default afdianRegistPage;
