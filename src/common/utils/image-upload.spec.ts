import { assertValidImageUpload, MAX_IMAGE_SIZE_BYTES } from './image-upload';

describe('assertValidImageUpload', () => {
  const baseFile = {
    buffer: Buffer.from('data'),
    mimetype: 'image/jpeg',
    size: 1024,
  } as Express.Multer.File;

  it('throws when file is missing', () => {
    expect(() => assertValidImageUpload(undefined)).toThrow(
      'Arquivo de imagem obrigatorio',
    );
  });

  it('throws when mimetype is invalid', () => {
    expect(() =>
      assertValidImageUpload({
        ...baseFile,
        mimetype: 'application/pdf',
      }),
    ).toThrow('Tipo de imagem invalido');
  });

  it('throws when file is too large', () => {
    expect(() =>
      assertValidImageUpload({
        ...baseFile,
        size: MAX_IMAGE_SIZE_BYTES + 1,
      }),
    ).toThrow('Arquivo maior que 5MB');
  });

  it('returns file when valid', () => {
    expect(assertValidImageUpload(baseFile)).toEqual(baseFile);
  });
});
