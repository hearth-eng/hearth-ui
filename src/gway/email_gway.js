const { SESv2Client, SendEmailCommand } = require('@aws-sdk/client-sesv2');
const Gateway = require('./gateway');
const {getLogger} = require('./../util/logger');

const log = getLogger(__filename);

class EmailGateway extends Gateway {

    constructor() {
        super();

        this.client = new SESv2Client({ region: process.env.AWS_REGION || 'ap-south-1' });
        this.from = process.env.SES_FROM_EMAIL;
    }

    async send(param) {
        const recipient = param.recipient;
        const otp = param.otp;
        const validity = param.ttlMin;

        const subject = 'Hearth OTP';
        const text =
            `Hearth email OTP: ${otp}. ` +
            `Valid for ${validity} minutes. ` +
            `Never share this OTP with anyone.`;

        if (log.isDebugEnabled()) {
            log.debug(`Sending email from ${this.from} to ${recipient}. Subject: ${subject}. Body: ${text}`);
        }

        const command = new SendEmailCommand({
            FromEmailAddress: this.from,
            Destination: {
                ToAddresses: [recipient]
            },
            Content: {
                Simple: {
                    Subject: { Data: subject, Charset: 'UTF-8' },
                    Body: {
                        Text: { Data: text, Charset: 'UTF-8' }
                    }
                }
            }
        });

        try {
            const response = await this.client.send(command);
            if (log.isDebugEnabled()) {
                log.debug('SES send succeeded. MessageId: %s', response.MessageId);
            }
            return {
                success: true,
                message: 'Email sent successfully',
                messageId: response.MessageId
            };
        }
        catch (err) {
            log.error('Error sending email via SES to %s: %s', recipient, err.message);
            throw err;
        }
    }
}

module.exports = new EmailGateway();
