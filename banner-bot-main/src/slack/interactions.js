const { TEMPLATES, listLogos } = require('../templates/templates');
const { renderBanner } = require('../renderer');
const fs = require('fs');

const REPO_RAW = 'https://raw.githubusercontent.com/onebozhenko-creator/banner-bot-1/main/banner-bot-main/docs';

const PREVIEW_URLS = {
  'type-a': `${REPO_RAW}/preview-type-a.png`,
  'type-b': `${REPO_RAW}/preview-type-b.png`,
  'type-c': `${REPO_RAW}/preview-type-c.png`,
  'type-e': `${REPO_RAW}/preview-type-e.png`,
  'type-f': `${REPO_RAW}/preview-type-f.png`,
};

const truncate = (str, max = 75) => str.length > max ? str.slice(0, max - 1) + '…' : str;

function buildModalBlocks(selectedTemplateId = null) {
  const templateOptions = Object.entries(TEMPLATES).map(([id, t]) => ({
    text: { type: 'plain_text', text: truncate(`${t.name} — ${t.description}`) },
    value: id,
  }));

  const logos = listLogos();
  const logoOptions = logos.length > 0
    ? logos.map(l => ({
        text: { type: 'plain_text', text: truncate(l.replace(/\.[^.]+$/, '')) },
        value: l,
      }))
    : [{ text: { type: 'plain_text', text: 'No logos available' }, value: 'none' }];

  const templateBlock = {
    type: 'input',
    block_id: 'template_block',
    dispatch_action: true,
    label: { type: 'plain_text', text: 'Template' },
    element: {
      type: 'static_select',
      action_id: 'template_select',
      placeholder: { type: 'plain_text', text: 'Choose a template...' },
      options: templateOptions,
      ...(selectedTemplateId && {
        initial_option: templateOptions.find(o => o.value === selectedTemplateId),
      }),
    },
  };

  const blocks = [templateBlock];

  // Show preview image if a template is selected and has a preview
  if (selectedTemplateId && PREVIEW_URLS[selectedTemplateId]) {
    blocks.push({
      type: 'image',
      block_id: 'preview_block',
      image_url: PREVIEW_URLS[selectedTemplateId],
      alt_text: `Preview: ${TEMPLATES[selectedTemplateId]?.name || selectedTemplateId}`,
    });
  }

  blocks.push(
    {
      type: 'input',
      block_id: 'title_block',
      label: { type: 'plain_text', text: 'Title' },
      optional: true,
      element: {
        type: 'plain_text_input',
        action_id: 'title_input',
        placeholder: { type: 'plain_text', text: 'Main banner title' },
        multiline: true,
      },
    },
    {
      type: 'input',
      block_id: 'subtitle_block',
      label: { type: 'plain_text', text: 'Subtitle' },
      optional: true,
      element: {
        type: 'plain_text_input',
        action_id: 'subtitle_input',
        placeholder: { type: 'plain_text', text: 'Small text above the title (optional)' },
      },
    },
    {
      type: 'input',
      block_id: 'logo_block',
      label: { type: 'plain_text', text: 'Partner Logo' },
      optional: true,
      element: {
        type: 'static_select',
        action_id: 'logo_select',
        placeholder: { type: 'plain_text', text: 'Choose partner logo...' },
        options: logoOptions,
      },
    },
    {
      type: 'input',
      block_id: 'theme_block',
      label: { type: 'plain_text', text: 'Theme' },
      element: {
        type: 'static_select',
        action_id: 'theme_select',
        options: [
          { text: { type: 'plain_text', text: 'Light' }, value: 'light' },
          { text: { type: 'plain_text', text: 'Dark' }, value: 'dark' },
        ],
        initial_option: { text: { type: 'plain_text', text: 'Light' }, value: 'light' },
      },
    },
    {
      type: 'input',
      block_id: 'date_block',
      label: { type: 'plain_text', text: 'Date Range (for Week in Blockchains)' },
      optional: true,
      element: {
        type: 'plain_text_input',
        action_id: 'date_input',
        placeholder: { type: 'plain_text', text: 'e.g. February 23 – March 1' },
      },
    }
  );

  return blocks;
}

function registerSlackHandlers(app) {
  // /banner command - opens the modal
  app.command('/banner', async ({ ack, body, client }) => {
    await ack();

    await client.views.open({
      trigger_id: body.trigger_id,
      view: {
        type: 'modal',
        callback_id: 'banner_submit',
        title: { type: 'plain_text', text: 'Create Banner' },
        submit: { type: 'plain_text', text: 'Generate' },
        close: { type: 'plain_text', text: 'Cancel' },
        private_metadata: body.channel_id || '',
        blocks: buildModalBlocks(),
      },
    });
  });

  // When user selects a template — update modal with preview
  app.action('template_select', async ({ ack, body, client }) => {
    await ack();

    const selectedTemplateId = body.actions[0].selected_option.value;

    await client.views.update({
      view_id: body.view.id,
      hash: body.view.hash,
      view: {
        type: 'modal',
        callback_id: 'banner_submit',
        title: { type: 'plain_text', text: 'Create Banner' },
        submit: { type: 'plain_text', text: 'Generate' },
        close: { type: 'plain_text', text: 'Cancel' },
        private_metadata: body.view.private_metadata,
        blocks: buildModalBlocks(selectedTemplateId),
      },
    });
  });

  // Handle modal submission
  app.view('banner_submit', async ({ ack, view, client, body }) => {
    await ack();

    const values = view.state.values;
    const templateId = values.template_block.template_select.selected_option.value;
    const title = values.title_block.title_input?.value || '';
    const subtitle = values.subtitle_block.subtitle_input?.value || '';
    const partnerLogo = values.logo_block.logo_select?.selected_option?.value || '';
    const theme = values.theme_block.theme_select.selected_option.value;
    const dateRange = values.date_block.date_input?.value || '';
    const channelId = view.private_metadata;
    const userId = body.user.id;

    try {
      const msg = channelId
  ? await client.chat.postMessage({
      channel: channelId,
     text: `:point_down: Your banner is ready in the thread!`,
    })
  : null;

const threadTs = msg?.ts;

      const params = {
        title,
        subtitle,
        partnerLogo: partnerLogo !== 'none' ? partnerLogo : '',
        theme,
        dateRange,
      };

      const outputPath = await renderBanner(templateId, params);

      const uploadTarget = channelId || userId;
      await client.files.uploadV2({
        channel_id: uploadTarget,
        file: fs.createReadStream(outputPath),
        thread_ts: threadTs,
        filename: `banner-${Date.now()}.png`,
        title: `Banner: ${title || TEMPLATES[templateId].name}`,
        initial_comment: `:white_check_mark: <@${userId}> Banner ready! Template: *${TEMPLATES[templateId].name}*${title ? ` | Title: "${title}"` : ''}`,
      });

    

      fs.unlinkSync(outputPath);
    } catch (error) {
      console.error('Banner generation error:', error);
      const target = channelId || userId;
      if (target) {
        await client.chat.postMessage({
          channel: target,
          text: `:x: Failed to generate banner: ${error.message}`,
        });
      }
    }
  });
}

module.exports = { registerSlackHandlers };
