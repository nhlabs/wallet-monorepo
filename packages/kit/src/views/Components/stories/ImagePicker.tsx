import { useState } from 'react';

import { MediaTypeOptions, launchImageLibraryAsync } from 'expo-image-picker';

import { Button, Center, Image } from '@mywallet/components';

const ImagePickerGallery = () => {
  const [image, setImage] = useState('');

  const pickImage = async () => {
    const result = await launchImageLibraryAsync({
      mediaTypes: MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 1,
    });

    if (!result.cancelled) {
      setImage(result.uri);
    }
  };

  return (
    <Center flex="1" bg="background-hovered">
      <Button width="50px" height="50px" onPress={pickImage} />
      {image && (
        <Image source={{ uri: image }} style={{ width: 200, height: 200 }} />
      )}
    </Center>
  );
};

export default ImagePickerGallery;
