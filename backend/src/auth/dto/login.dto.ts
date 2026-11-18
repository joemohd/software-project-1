import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class LoginDto {
  @IsEmail()
  @MaxLength(254)
  emailAddress: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(72)
  password: string;
}
