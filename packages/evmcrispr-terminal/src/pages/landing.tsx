import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { useChain, useSpringRef } from '@react-spring/web';
import {
  Box,
  Button,
  Center,
  Heading,
  Link,
  Stack,
  Text,
} from '@chakra-ui/react';

import Card from '../components/card';

import Brett from '../assets/brett.png';
import Michael from '../assets/michael.png';
import Griff from '../assets/griff.png';

import FadeIn from '../components/animations/fade-in';

const Landing = () => {
  const [showCardContent, setCardContent] = useState(false);
  const typeRef = useSpringRef();
  const buttonsRef = useSpringRef();
  const cardRef = useSpringRef();
  const peepsRef = useSpringRef();

  useChain([typeRef, buttonsRef, peepsRef, cardRef]);

  const handleCardContent = () => setCardContent(true);

  return (
    <Box as="main" maxWidth="956px" margin="0 auto">
      <FadeIn componentRef={typeRef}>
        <Box pt={16} pb={8}>
          <Text color="white" textAlign="center" fontSize="2xl">
            <Text as="strong" color="brand.green">
              EVMcrispr
            </Text>{' '}
            is a powerful tool that combines a domain-specific language with a
            Javascript library to interact with Aragon DAOs. With it, you can
            bundle{' '}
            <Text as="strong" color="brand.green">
              many DAO operations into just one script
            </Text>
            , generating a singular transaction, usually a vote. These commands
            include installing or upgrading apps, changing their permissions,
            executing actions or interacting with external contracts.
          </Text>
        </Box>
      </FadeIn>

      <FadeIn componentRef={buttonsRef}>
        <Center>
          <Stack direction={{ base: 'column', sm: 'row' }} alignItems="center">
            <Link
              isExternal
              href="https://forum.1hive.org/t/commons-swarm-outcomes-3-3-a-tool-to-mutate-a-daos-dna/4924"
              target="_blank"
              rel="noreferrer"
            >
              <Button
                _hover={{ bg: 'brand.btn.hover', transition: 'all 0.5s' }}
                bgColor="brand.btn.bg"
                color="brand.btn.color"
                size="lg"
              >
                Learn How to Use
              </Button>
            </Link>
            <Link as={RouterLink} to="/terminal">
              <Button
                _hover={{ bg: 'brand.btn.hover', transition: 'all 0.5s' }}
                bgColor="brand.btn.bg"
                color="brand.btn.color"
                size="lg"
              >
                Open Terminal
              </Button>
            </Link>
          </Stack>
        </Center>
      </FadeIn>

      <FadeIn componentRef={peepsRef}>
        <Heading pt={16} textAlign="center" as="h1" size="lg">
          Who&apos;s using EVMcrispr?
        </Heading>
      </FadeIn>

      <FadeIn componentRef={cardRef} onRest={handleCardContent}>
        <Center pt={8} mb={28} width="100%" gap={16}>
          <Card
            showContent={showCardContent}
            image={Brett}
            height={107}
            name="Brett Sun"
            info="Former Aragon CTO"
            description={`"EVMCrispr is the tool every aragonOS DAO has been waiting for. It presents a step change in DAO operations that enables everyone to invoke complex proposals—not just those brave enough to write complex transaction-generating code."`}
          />
          <Card
            showContent={showCardContent}
            image={Michael}
            name="Michael Egorov"
            info="Founder of Curve"
            description={`"We had an important upgrade of CurveDAO (based on Aragon) which had to be very well tested given that the DAO controls parameters of a platform which holds more than $20B USD worth of assets. EVMcrispr helped to get this upgrade done safely."`}
          />
          <Card
            showContent={showCardContent}
            image={Griff}
            name="Griff Green"
            info="Co-founder of Giveth, Commons Stack & DAppNode"
            description={`"EVMcrispr is what Aragon always needed and it finally has. Through it DAOs can evolve transparently at the speed of the community without the need to trust a technocracy."`}
          />
        </Center>
      </FadeIn>
    </Box>
  );
};

export default Landing;
