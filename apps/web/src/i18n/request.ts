import { getRequestConfig } from 'next-intl/server';
import { prepareMessages } from './messages';

export default getRequestConfig(async ({ locale }) => {
  const { locale: normalizedLocale, messages } = prepareMessages(locale);
  return {
    locale: normalizedLocale,
    messages,
  };
});
