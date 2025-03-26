import DataTable from '../../components/DataTable';
import { useTranslations } from 'next-intl';

interface DisclosureItem {
  title: string;
  content: string[];
}

export default function DisclosurePage() {
  const t = useTranslations('disclosure');
  
  const disclosureItems: DisclosureItem[] = [
    {
      title: t('items.legalName.title'),
      content: t.raw('items.legalName.content')
    },
    {
      title: t('items.address.title'),
      content: t.raw('items.address.content')
    },
    {
      title: t('items.phone.title'),
      content: t.raw('items.phone.content')
    },
    {
      title: t('items.email.title'),
      content: t.raw('items.email.content')
    },
    {
      title: t('items.operator.title'),
      content: t.raw('items.operator.content')
    },
    {
      title: t('items.otherFees.title'),
      content: t.raw('items.otherFees.content')
    },
    {
      title: t('items.refundPolicy.title'),
      content: t.raw('items.refundPolicy.content')
    },
    {
      title: t('items.serviceTime.title'),
      content: t.raw('items.serviceTime.content')
    },
    {
      title: t('items.paymentMethods.title'),
      content: t.raw('items.paymentMethods.content')
    },
    {
      title: t('items.paymentCycle.title'),
      content: t.raw('items.paymentCycle.content')
    },
    {
      title: t('items.price.title'),
      content: t.raw('items.price.content')
    }
  ];

  return (
    <div className="space-y-8">
      <h1 className="title-primary mb-6">{t('title')}</h1>
      <p className="text-content mb-8">
        {t('description')}
      </p>
      
      <DataTable items={disclosureItems} />

      <p className="text-content text-sm mt-8">
        {t('lastUpdate')}
      </p>
    </div>
  )
} 